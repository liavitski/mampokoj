import 'server-only';

import { Redis } from '@upstash/redis';

/**
 * One shared client, so every caller reaches the same Redis database.
 *
 * Note `fromEnv` does **not** throw when the variables are missing: it logs a
 * warning and returns a client that looks healthy but fails on every call.
 * Importing this module therefore proves nothing about the configuration.
 *
 * The defaults are tuned for a request path rather than for throughput. The
 * library would otherwise retry five times with `exp(n) * 50` backoff, so a
 * Redis outage costs several seconds per call and the `catch` that is meant to
 * degrade gracefully only runs long after the caller has given up. There is no
 * request-timeout option in the client, but `signal` may be a factory, which
 * gives every request its own deadline.
 *
 * The three settings below were exported while an advisory user lock derived its
 * acquire-loop budget from them. That lock is retired (HANDOFF §9.2) and
 * `ratelimit.ts` is the only consumer of this client, so they are module-private
 * now: an exported constant nothing imports is an invitation to couple to a
 * tuning decision that exists only for this one call site.
 */
const REDIS_REQUEST_TIMEOUT_MS = 2_000;
const REDIS_RETRIES = 2;
const REDIS_RETRY_BACKOFF_MS = 100;

export const redis = Redis.fromEnv({
  retry: { retries: REDIS_RETRIES, backoff: () => REDIS_RETRY_BACKOFF_MS },
  signal: () => AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
});