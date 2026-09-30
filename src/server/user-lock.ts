import 'server-only';

import { randomUUID } from 'node:crypto';

import { redis } from './redis';

/**
 * How long a held lock survives without an explicit release.
 *
 * This is a safety net for a process that dies mid-section, not the normal
 * path -- `withUserLock` always releases. It has to comfortably exceed the time
 * a count and an insert take, because a lock that expires while its holder is
 * still running is exactly the race this exists to remove.
 *
 * It also has to exceed the whole acquire budget below, so that a caller can
 * never outlive the lock it is waiting for and then acquire one that has since
 * expired and been taken by somebody else.
 */
const LOCK_TTL_MS = 10_000;

/**
 * A second caller waits rather than failing outright: the common case is one
 * user double-submitting the create form, and two round trips to Neon on a
 * cold branch regularly take longer than the first attempt's patience.
 *
 * Ten attempts with exponential backoff capped at 200ms is roughly 1.5s of
 * waiting in total, which covers a slow-but-normal first request without
 * turning a genuine double-click into an error. The jitter keeps a burst of
 * submissions from retrying in lockstep.
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
 * `MAX_ADS_PER_USER` is enforced by counting and then inserting, and the two
 * statements are not atomic: concurrent requests all read the same count and
 * all insert. This closes that window.
 *
 * The key is the session's user id, which is the OAuth provider's account id.
 * Somebody signing in with two different providers has two ids, and so two
 * locks and two counts -- the same limitation the ad limit itself has always
 * had, encoded here rather than fixed.
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
 * unreachable the critical section still runs, unserialized, because a soft
 * quota should not become a hard availability dependency -- the same way the ad
 * limit already failed open before this existed. That degradation is logged, so
 * it is visible rather than silent.
 */
export async function withUserLock<T>(
  userId: string,
  fn: () => Promise<T>,
  operation = 'create-ad'
): Promise<T> {
  // Operation-scoped so two different locks for one user do not contend.
  const key = `mampokoj:lock:${operation}:${userId}`;
  const token = randomUUID();

  let acquired = false;
  let redisFailed = false;
  let lastError: unknown;

  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
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

    if (attempt < ACQUIRE_ATTEMPTS - 1) await sleep(backoffFor(attempt));
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
};