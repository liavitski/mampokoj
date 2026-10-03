import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  redis,
  REDIS_REQUEST_TIMEOUT_MS,
  REDIS_RETRIES,
  REDIS_RETRY_BACKOFF_MS,
} from './redis';

/**
 * How long a held lock survives without an explicit release.
 *
 * This is a safety net for a process that dies mid-section, not the normal
 * path -- `withUserLock` always releases. It has to comfortably exceed the time
 * a count and an insert take, because a lock that expires while its holder is
 * still running is exactly the race this exists to remove.
 */
const LOCK_TTL_MS = 10_000;

/**
 * The longest a single `redis.set` call can take.
 *
 * The client aborts each HTTP request after `REDIS_REQUEST_TIMEOUT_MS` and
 * retries `REDIS_RETRIES` times, so the signal is per request and one command
 * can occupy this long. Deriving it from the client's own settings is the
 * point: raising the timeout raises this too, rather than silently leaving the
 * acquire loop able to overshoot the TTL.
 */
const MAX_SET_CALL_MS =
  REDIS_REQUEST_TIMEOUT_MS * (REDIS_RETRIES + 1) +
  REDIS_RETRIES * REDIS_RETRY_BACKOFF_MS;

/**
 * Spare time between the last possible acquisition and the TTL expiring.
 *
 * Without it the two numbers could meet exactly, and a clock skew between this
 * process and Redis would be enough to let the TTL win.
 */
const TTL_SAFETY_MARGIN_MS = 1_000;

/**
 * The wall-clock limit on *starting* further attempts, not the sum of the
 * backoff sleeps.
 *
 * Those are different quantities and conflating them is a bug: an earlier
 * version of this file bounded the loop by `attempts * backoff`, roughly 1.8s,
 * and asserted that against the TTL. That ignored per-call latency entirely. Ten
 * attempts against a slow or stalling Redis ran for well over a minute, so a
 * waiter could outlive the lock it was waiting for, watch it expire and be
 * taken by somebody else, then acquire "successfully" and run concurrently.
 *
 * Bounding wall-clock instead means a request that is merely slow stops trying
 * early, which is the safe direction: the caller is told to retry rather than
 * being admitted alongside a holder it believes it excludes.
 *
 * Derived from the TTL so the invariant cannot be broken by editing one number.
 */
const ACQUIRE_DEADLINE_MS =
  LOCK_TTL_MS - MAX_SET_CALL_MS - TTL_SAFETY_MARGIN_MS;

/**
 * A second caller waits rather than failing outright: the common case is one
 * user double-submitting the create form, and two round trips to Neon on a
 * cold branch regularly take longer than the first attempt's patience.
 *
 * Ten attempts covers contention when Redis is responsive, which is the case
 * that matters. When it is not, the wall-clock deadline above is what stops the
 * loop, not this count.
 */
const ACQUIRE_ATTEMPTS = 10;
const ACQUIRE_BACKOFF_BASE_MS = 40;
const ACQUIRE_BACKOFF_CAP_MS = 200;

/**
 * Releases the lock only when the caller still owns it.
 *
 * Without the token comparison, a holder whose TTL expired and whose lock was
 * since taken by somebody else would delete *their* lock on the way out,
 * turning one slow request into two concurrent ones. `DEL` cannot express the
 * check, so this has to be a script, which Redis runs atomically.
 */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end`;

export class LockBusyError extends Error {
  constructor() {
    super('Lock is held by another request');
    this.name = 'LockBusyError';
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const backoffFor = (attempt: number) =>
  Math.min(
    ACQUIRE_BACKOFF_BASE_MS * 2 ** attempt,
    ACQUIRE_BACKOFF_CAP_MS
  ) +
  Math.floor(Math.random() * ACQUIRE_BACKOFF_BASE_MS);

/**
 * Releases the lock, reporting rather than throwing every way it can fail.
 *
 * The work in the critical section has already happened by the time this runs,
 * so a failure here must never turn a successful create into an error. It is
 * safe to call speculatively: the script only deletes when the token matches,
 * so calling it for a lock this caller never held is a no-op.
 *
 * `expectHeld` distinguishes "we held it and lost it" -- which means the TTL
 * expired mid-section and two sections may have overlapped -- from "we were
 * never sure we held it", which is expected on the degraded path.
 */
async function releaseQuietly(
  key: string,
  token: string,
  expectHeld: boolean
): Promise<void> {
  try {
    const deleted = await redis.eval(RELEASE_SCRIPT, [key], [token]);

    if (expectHeld && deleted !== 1) {
      // Silent here would mean two critical sections ran at once with no trace.
      console.error(
        'Ad lock was no longer held at release; sections may have overlapped'
      );
    }
  } catch (error) {
    // The lock falls back to its TTL, which is the correct outcome.
    console.error('Failed to release ad lock', error);
  }
}

/**
 * Serializes work per session user across every server instance.
 *
 * `MAX_ADS_PER_USER` is enforced by the unique index on
 * (userId, slot), so the limit holds whether or not this lock
 * runs. What the lock still buys is serialization: two creates
 * for one user cannot race for the same free slot, so neither
 * spends an insert on a conflict it was always going to lose.
 *
 * The key is the session's user id, which is the OAuth provider's account id.
 * Somebody signing in with two different providers has two ids, and so two
 * locks and two sets of slots -- the same limitation the ad limit itself has
 * always had, encoded here rather than fixed.
 *
 * It is a Redis mutex rather than a database one because the HTTP driver this
 * app uses cannot open a transaction -- `db.transaction` throws "No
 * transactions support in neon-http driver" -- and a single-statement
 * `pg_advisory_xact_lock` does not help either. Under READ COMMITTED a
 * statement's snapshot is fixed when the statement begins, so a caller that
 * blocks on the lock proceeds with a snapshot from before the winner
 * committed, and its `count(*)` cannot see the new row. That was measured, not
 * assumed: eight concurrent inserts breached a limit of two in five rounds out
 * of six. A trigger has the same problem, since it runs inside the INSERT's
 * snapshot.
 *
 * The lock is deliberately advisory rather than authoritative. If Redis is
 * unreachable the critical section still runs, unserialized, and the slot
 * index still enforces the same cap -- an outage can cost a create a lost
 * race for a free slot, never an over-limit account. That degradation is
 * logged, so it is visible rather than silent.
 */
export async function withUserLock<T>(
  userId: string,
  fn: () => Promise<T>,
  /**
   * Required rather than defaulted. Two operations sharing one lock would
   * serialize unrelated work; two spellings of the same operation would stop
   * serializing anything at all, silently. Making the caller name it puts that
   * choice where it is visible.
   */
  operation: string
): Promise<T> {
  // Operation-scoped so two different locks for one user do not contend.
  const key = `mampokoj:lock:${operation}:${userId}`;
  const token = randomUUID();
  const deadline = Date.now() + ACQUIRE_DEADLINE_MS;

  let acquired = false;
  let redisFailed = false;
  let lastError: unknown;

  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
    // Checked before starting an attempt, not after finishing one, so a slow
    // Redis cannot push the loop past the TTL.
    if (Date.now() >= deadline) break;

    try {
      // SET key token NX PX ttl -- "only if absent", so exactly one caller
      // wins. A lost race returns null rather than throwing.
      const result = await redis.set(key, token, { nx: true, px: LOCK_TTL_MS });

      if (result === 'OK') {
        acquired = true;
        break;
      }

      if (result !== null) {
        // 'OK' and null are the only documented outcomes. Anything else means
        // the client or something in front of it changed behaviour, and every
        // caller would silently be told the lock is busy.
        console.error('Unexpected SET NX result from Redis', result);
      }
    } catch (error) {
      // One failed request is not proof that Redis is down; keep trying, and
      // only fall back to running unserialized if the whole budget failed.
      redisFailed = true;
      lastError = error;
    }

    const remaining = deadline - Date.now();

    // Sleeping past the deadline would only delay the same decision by one
    // backoff, so give up as soon as there is no longer time to be useful.
    if (attempt === ACQUIRE_ATTEMPTS - 1 || remaining <= 0) break;

    await sleep(Math.min(backoffFor(attempt), remaining));
  }

  if (!acquired) {
    if (!redisFailed) throw new LockBusyError();

    console.error('Ad lock unavailable, running unserialized', lastError);

    // A request can fail *after* Redis applied it -- a lost response, a
    // truncated body. Releasing is the safe move either way, because the
    // script only deletes when the token still matches, and skipping it would
    // leave this user's ad creation blocked for the whole TTL.
    await releaseQuietly(key, token, false);

    return fn();
  }

  try {
    return await fn();
  } finally {
    await releaseQuietly(key, token, true);
  }
}

export const __testing = {
  RELEASE_SCRIPT,
  LOCK_TTL_MS,
  ACQUIRE_ATTEMPTS,
  ACQUIRE_BACKOFF_BASE_MS,
  ACQUIRE_BACKOFF_CAP_MS,
  ACQUIRE_DEADLINE_MS,
  MAX_SET_CALL_MS,
  TTL_SAFETY_MARGIN_MS,
};