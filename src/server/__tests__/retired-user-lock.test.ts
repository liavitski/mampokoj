// @vitest-environment node
/**
 * The ad lock is retired. This file is the tripwire.
 *
 * `withUserLock` was deleted on 2026-10-03 (HANDOFF §9.2). It was an advisory
 * Redis mutex that had been reduced to buying one thing: the avoidance of a single
 * wasted INSERT when two creates for one user raced for the same free slot. The
 * unique index on (userId, slot) already refuses a duplicate pair, so a lost race
 * costs one insert it did not need and can never produce an over-limit account.
 * For that it required a mutex, a Lua release script, an acquire loop bounded by
 * wall-clock, and roughly 800 lines of tests -- against a Redis that was an
 * unreached dependency for most of this project's history.
 *
 * ## Why assert the absence of a deleted file
 *
 * A retired module is exactly the thing that comes back. Someone hits a lost race,
 * reaches for a mutex, and writes a smaller one; or a module is copied forward on a
 * branch that predates the deletion. Neither shows up as a failing test, because a
 * lock that works correctly in the *presence* of the slot index passes every
 * behavioural assertion there is.
 *
 * So this does not test the lock's behaviour -- there is none left to test. It
 * asserts the deletion, which is the property that is easy to lose and impossible
 * to notice.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_DIR = join(process.cwd(), 'src/server');

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

/** Source with comments removed, so prose about the lock is not mistaken for it. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('the retired ad lock', () => {
  it('no longer exists', () => {
    expect(
      existsSync(join(SERVER_DIR, 'user-lock.ts')),
      'src/server/user-lock.ts is back; the slot index already enforces the limit'
    ).toBe(false);
  });

  it('took its two test files with it', () => {
    // Named individually because "the tests are gone" and "the tests were moved"
    // are different failures, and a moved lock is still a live lock.
    expect(
      existsSync(join(SERVER_DIR, '__tests__/user-lock.test.ts')),
      'the lock tests are back'
    ).toBe(false);
    expect(
      existsSync(join(SERVER_DIR, '__tests__/redis-client-contract.test.ts')),
      'the redis client contract test is back; it only ever drove the lock'
    ).toBe(false);
  });

  it('is not imported anywhere in the app', () => {
    // The one real consumer was `createAd`. `upload-guard` also mentions it, in a
    // comment comparing the two failure modes -- that prose is allowed to survive
    // the deletion, an import is not.
    const createAd = code('src/server/actions/createAd.tsx');
    const uploadGuard = code('src/server/upload-guard.ts');

    expect(createAd).not.toContain('user-lock');
    expect(uploadGuard).not.toContain('user-lock');
    expect(uploadGuard).not.toContain('withUserLock');
  });

  it('left Redis in the app for the rate limiter, and only there', () => {
    // Not "Redis is gone" -- `checkUploadAdmission`'s ratelimit still uses it, and
    // §3 is explicit that the rate limiter fails closed while the lock failed
    // open, which is a deliberate difference rather than an inconsistency to
    // tidy away. This asserts the create path lost its Redis dependency without
    // pretending the app did.
    expect(code('src/server/ratelimit.ts')).toContain("from './redis'");
    expect(code('src/server/redis.ts')).toContain('Redis.fromEnv');
  });

  it('documents that the create path no longer needs a mutex', async () => {
    // The reason has to be written down or the next lost race looks like a bug
    // rather than the accepted cost. `insertIntoFreeSlot`'s comment is where a
    // reader lands.
    const createAd = read('src/server/actions/createAd.tsx');

    expect(createAd).toContain('withUserLock');
    expect(createAd).toMatch(/concurrency story|retired/i);
  });
});