// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

// The mock replaces only the client. The timing constants have to come from the
// real module, because the invariant below is about how long a `redis.set` can
// occupy the lock loop -- and a copy of those numbers here would drift away from
// the configuration that actually produces them.
vi.mock('@/server/redis', async () => {
  const actual = await vi.importActual<typeof import('@/server/redis')>(
    '@/server/redis'
  );

  return { ...actual, redis: mocks };
});

const { withUserLock, LockBusyError, __testing } = await import('../user-lock');
const { REDIS_REQUEST_TIMEOUT_MS, REDIS_RETRIES, REDIS_RETRY_BACKOFF_MS } =
  await import('@/server/redis');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.set.mockResolvedValue('OK');
  mocks.eval.mockResolvedValue(1);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('withUserLock acquisition', () => {
  it('runs the critical section when the lock is taken', async () => {
    const fn = vi.fn(async () => 'done');

    await expect(withUserLock('user-a', fn, 'create-ad')).resolves.toBe('done');

    expect(fn).toHaveBeenCalledOnce();
  });

  it('scopes the lock to the operation and the user', async () => {
    await withUserLock('user-a', async () => {}, 'create-ad');

    expect(mocks.set.mock.calls[0]![0]).toBe(
      'mampokoj:lock:create-ad:user-a'
    );
  });

  it('does not share a lock between two users', async () => {
    await withUserLock('user-a', async () => {}, 'create-ad');
    await withUserLock('user-b', async () => {}, 'create-ad');

    const keys = mocks.set.mock.calls.map((call) => call[0]);
    expect(keys).toEqual([
      'mampokoj:lock:create-ad:user-a',
      'mampokoj:lock:create-ad:user-b',
    ]);
  });

  it('does not share a lock between two operations for one user', async () => {
    // The operation is part of the key, so a second kind of locked work for
    // the same user neither contends with nor inherits this caller's guarantee.
    await withUserLock('user-a', async () => {}, 'delete-ad');
    await withUserLock('user-a', async () => {}, 'create-ad');

    const keys = mocks.set.mock.calls.map((call) => call[0]);
    expect(keys).toEqual([
      'mampokoj:lock:delete-ad:user-a',
      'mampokoj:lock:create-ad:user-a',
    ]);
  });

  it('sets the key only if absent, with a TTL', async () => {
    await withUserLock('user-a', async () => {}, 'create-ad');

    // NX is what makes it a mutex; without it every caller would believe it
    // had the lock.
    expect(mocks.set.mock.calls[0]![2]).toEqual({
      nx: true,
      px: __testing.LOCK_TTL_MS,
    });
  });

  it('stops retrying as soon as it wins the lock', async () => {
    mocks.set.mockResolvedValueOnce(null).mockResolvedValue('OK');

    await withUserLock('user-a', async () => {}, 'create-ad');

    expect(mocks.set).toHaveBeenCalledTimes(2);
  });
});

describe('withUserLock contention', () => {
  it('does not run the critical section when the lock stays held', async () => {
    mocks.set.mockResolvedValue(null);
    const fn = vi.fn(async () => 'done');

    await expect(withUserLock('user-a', fn, 'create-ad')).rejects.toThrow(LockBusyError);

    // Running anyway would be the exact race the lock exists to close.
    expect(fn).not.toHaveBeenCalled();
  });

  it('gives up after a bounded number of attempts', async () => {
    mocks.set.mockResolvedValue(null);

    await expect(withUserLock('user-a', async () => {}, 'create-ad')).rejects.toThrow(
      LockBusyError
    );

    expect(mocks.set).toHaveBeenCalledTimes(__testing.ACQUIRE_ATTEMPTS);
  });

  it('rejects with an error a caller can distinguish from a failure', async () => {
    mocks.set.mockResolvedValue(null);

    await expect(
      withUserLock('user-a', async () => {}, 'create-ad')
    ).rejects.toBeInstanceOf(LockBusyError);
  });
});

describe('withUserLock release', () => {
  it('releases with a script that only deletes the caller own lock', async () => {
    await withUserLock('user-a', async () => {}, 'create-ad');

    const [script, keys, args] = mocks.eval.mock.calls[0] as [
      string,
      string[],
      string[],
    ];

    // A bare DEL would let a holder whose TTL expired delete the lock that
    // somebody else has since taken.
    expect(script).toContain('GET');
    expect(script).toContain('ARGV[1]');
    expect(script).toContain('DEL');
    expect(keys).toEqual(['mampokoj:lock:create-ad:user-a']);
    expect(args).toHaveLength(1);
  });

  it('releases with the same token it set', async () => {
    await withUserLock('user-a', async () => {}, 'create-ad');

    const setToken = mocks.set.mock.calls[0]![1] as string;
    const releaseArgs = mocks.eval.mock.calls[0]![2] as string[];

    expect(releaseArgs[0]).toBe(setToken);
  });

  it('passes the key as the script numkeys entry, not as an argument', async () => {
    await withUserLock('user-a', async () => {}, 'create-ad');

    const [, keys, args] = mocks.eval.mock.calls[0] as [
      string,
      string[],
      string[],
    ];

    // Redis reads `numkeys` off position 1 of the command. Getting this wrong
    // makes KEYS[1] resolve to the token instead of the lock, and the script
    // silently never matches.
    expect(keys).toHaveLength(1);
    expect(args).toHaveLength(1);
    expect(keys[0]).toBe('mampokoj:lock:create-ad:user-a');
  });

  it('uses the exact release script it was reviewed against', () => {
    // The Lua cannot be executed here -- the dev Redis host does not resolve --
    // so this pins the text. `eval` is atomic, and the comparison is what stops
    // a stale holder deleting the current one's key.
    expect(__testing.RELEASE_SCRIPT.replace(/\s+/g, ' ').trim()).toBe(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end'
    );
  });

  it('releases even when the critical section throws', async () => {
    await expect(
      withUserLock('user-a', async () => {
        throw new Error('boom');
      }, 'create-ad')
    ).rejects.toThrow('boom');

    // A lock left behind would block this user for the whole TTL.
    expect(mocks.eval).toHaveBeenCalledOnce();
  });

  it('returns the result even when the release fails', async () => {
    mocks.eval.mockRejectedValue(new Error('redis down'));

    await expect(
      withUserLock('user-a', async () => 'done', 'create-ad')
    ).resolves.toBe(
      'done'
    );

    // The work happened; the lock falls back to its TTL. Throwing here would
    // mask a successful create as a failure.
    expect(console.error).toHaveBeenCalled();
  });
});

describe('withUserLock when Redis is unreachable', () => {
  it('still runs the critical section rather than failing the request', async () => {
    mocks.set.mockRejectedValue(new Error('fetch failed'));
    const fn = vi.fn(async () => 'done');

    await expect(withUserLock('user-a', fn, 'create-ad')).resolves.toBe('done');

    expect(fn).toHaveBeenCalledOnce();
  });

  it('logs the degradation instead of losing it silently', async () => {
    mocks.set.mockRejectedValue(new Error('fetch failed'));

    await withUserLock('user-a', async () => {}, 'create-ad');

    // Fail-open is a deliberate trade-off, so it has to be observable.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('unserialized'),
      expect.anything()
    );
  });

  it('keeps trying after a single failed request', async () => {
    // One blip is not proof that Redis is down; bailing on attempt one would
    // give up on a lock that a retry would have won.
    mocks.set
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('OK');

    const fn = vi.fn(async () => 'done');

    await expect(withUserLock('user-a', fn, 'create-ad')).resolves.toBe('done');

    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('releases speculatively, in case the SET landed before it failed', async () => {
    mocks.set.mockRejectedValue(new Error('truncated response'));

    await withUserLock('user-a', async () => {}, 'create-ad');

    // If the write reached Redis but the response was lost, skipping the
    // release leaves this user's next create blocked for the whole TTL. The
    // release script is token-guarded, so calling it blind is a no-op.
    expect(mocks.eval).toHaveBeenCalledOnce();
  });

  it('does not report a lost lock as a busy one on the degraded path', async () => {
    mocks.set.mockRejectedValue(new Error('fetch failed'));
    mocks.eval.mockResolvedValue(0);

    // Never held, so a 0 here is expected rather than a lost lock.
    await withUserLock('user-a', async () => {}, 'create-ad');

    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('overlapped')
    );
  });
});

describe('withUserLock lock accounting', () => {
  /**
   * Recomputed from the client's own settings rather than read from
   * `__testing`, so this cannot agree with the implementation by construction.
   * A single `redis.set` occupies one HTTP attempt per retry plus its timeout,
   * and the abort signal is per request, not per command.
   */
  const worstSetCallMs =
    REDIS_REQUEST_TIMEOUT_MS * (REDIS_RETRIES + 1) +
    REDIS_RETRIES * REDIS_RETRY_BACKOFF_MS;

  it('bounds the whole acquire loop by wall-clock, not just by sleeps', () => {
    // A caller that outlives the lock it is waiting for can acquire one that
    // has since expired and been taken by somebody else, believing it is
    // exclusive. The attempt that succeeds may begin just before the deadline,
    // so the deadline plus one full call has to stay inside the TTL.
    expect(__testing.ACQUIRE_DEADLINE_MS).toBeGreaterThan(0);
    expect(__testing.ACQUIRE_DEADLINE_MS + worstSetCallMs).toBeLessThan(
      __testing.LOCK_TTL_MS
    );
  });

  it('leaves margin rather than meeting the TTL exactly', () => {
    // Clock skew between this process and Redis should not be able to decide
    // whether the guarantee holds.
    const slack = __testing.LOCK_TTL_MS - (__testing.ACQUIRE_DEADLINE_MS + worstSetCallMs);

    expect(slack).toBeGreaterThan(0);
  });

  it('keeps the deadline tied to the client timeout', () => {
    // What this catches is *drift*, not hardcoding: writing the deadline as a
    // literal equal to today's derived value still passes, because it is the
    // same number. It fails once the timeout is retuned and the deadline is
    // left behind, which is the case that would quietly reintroduce the
    // overshoot.
    expect(__testing.MAX_SET_CALL_MS).toBe(worstSetCallMs);
    expect(__testing.ACQUIRE_DEADLINE_MS).toBe(
      __testing.LOCK_TTL_MS - worstSetCallMs - __testing.TTL_SAFETY_MARGIN_MS
    );
  });

  it('waits long enough for a slow first request to finish', () => {
    // Two round trips to Neon on a cold branch. Below this, a double-submit
    // gets an error instead of the ad it asked for.
    const backoffTotal = Array.from(
      { length: __testing.ACQUIRE_ATTEMPTS - 1 },
      (_, i) => Math.min(__testing.ACQUIRE_BACKOFF_BASE_MS * 2 ** i, __testing.ACQUIRE_BACKOFF_CAP_MS)
    ).reduce((a, b) => a + b, 0);

    expect(backoffTotal).toBeGreaterThan(1_000);
    // And it still fits inside the wall-clock budget, so a responsive Redis
    // gets all ten attempts.
    expect(backoffTotal).toBeLessThan(__testing.ACQUIRE_DEADLINE_MS);
  });

  it('stops trying when Redis is slow, instead of running past the TTL', async () => {
    // The defect this guards: bounding the loop by the sum of backoff sleeps
    // ignored per-call latency, so ten slow attempts ran for minutes. A waiter
    // could then acquire a lock that had expired and been re-taken.
    mocks.set.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(null), 300);
        })
    );

    const startedAt = Date.now();

    await expect(
      withUserLock('user-a', async () => 'done', 'create-ad')
    ).rejects.toThrow(LockBusyError);

    const elapsed = Date.now() - startedAt;

    // Cut off by the deadline, not by exhausting the attempt count.
    expect(mocks.set.mock.calls.length).toBeLessThan(__testing.ACQUIRE_ATTEMPTS);
    expect(elapsed).toBeLessThan(__testing.ACQUIRE_DEADLINE_MS + 300);
  });

  it('reports a lost lock rather than dropping the overlap silently', async () => {
    // The lock expired while the critical section was still running, so
    // somebody else may have entered it.
    mocks.eval.mockResolvedValue(0);

    await withUserLock('user-a', async () => {}, 'create-ad');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('overlapped')
    );
  });

  it('accepts the documented SET NX results without complaint', async () => {
    mocks.set.mockResolvedValue(null);
    await expect(withUserLock('user-a', async () => {}, 'create-ad')).rejects.toThrow(
      LockBusyError
    );

    mocks.set.mockResolvedValue('OK');
    await withUserLock('user-a', async () => {}, 'create-ad');

    // A value the client does not recognise would otherwise make every create
    // fail as "busy" with no trace.
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Unexpected SET NX result'),
      expect.anything()
    );
  });

  it('logs a SET NX result it does not recognise', async () => {
    mocks.set.mockResolvedValue('WAT');

    // Unrecognised means "cannot prove the lock is free", so it refuses.
    await expect(withUserLock('user-a', async () => {}, 'create-ad')).rejects.toThrow(
      LockBusyError
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected SET NX result'),
      'WAT'
    );
  });
});

describe('withUserLock mutual exclusion', () => {
  /**
   * A stand-in for Redis that honours SET NX PX and the release script, so the
   * test exercises the real acquire/release protocol rather than a stub that
   * always says yes.
   */
  function fakeRedis() {
    const held = new Map<string, { token: string; expiresAt: number }>();
    const now = () => Date.now();
    const stats = { attempts: 0, refused: 0, concurrentHolders: 0, peakHolders: 0 };

    return {
      stats,
      set: vi.fn(
        async (
          key: string,
          token: string,
          opts: { nx?: boolean; px: number }
        ) => {
          stats.attempts += 1;

          const entry = held.get(key);

          // Models Redis faithfully: without NX, SET overwrites and returns OK,
          // so every caller would believe it had the lock. The exclusivity has
          // to come from the flag, not from the fake.
          if (opts.nx && entry && entry.expiresAt > now()) {
            stats.refused += 1;

            return null;
          }

          held.set(key, { token, expiresAt: now() + opts.px });

          stats.concurrentHolders = held.size;
          stats.peakHolders = Math.max(stats.peakHolders, held.size);

          return 'OK';
        }
      ),
      eval: vi.fn(
        async (
          _script: string,
          keys: string[],
          args: string[]
        ): Promise<number> => {
          const [key] = keys;
          const entry = key === undefined ? undefined : held.get(key);

          if (!entry || entry.token !== args[0]) return 0;

          held.delete(key!);

          return 1;
        }
      ),
      size: () => held.size,
    };
  }

  it('runs concurrent callers one at a time, and loses none of them', async () => {
    const fake = fakeRedis();
    mocks.set.mockImplementation(fake.set);
    mocks.eval.mockImplementation(fake.eval);

    let concurrent = 0;
    let peak = 0;

    const run = () =>
      withUserLock('user-a', async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        concurrent -= 1;
      }, 'create-ad');

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => run())
    );

    // This is the property the whole change exists for: never two at once.
    expect(peak).toBe(1);
    expect(fake.stats.peakHolders).toBe(1);

    // The losers wait and then run. Nothing is dropped, because a queued
    // create is still a legitimate one.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('actually contends, so the exclusion above is not free', async () => {
    const fake = fakeRedis();
    mocks.set.mockImplementation(fake.set);
    mocks.eval.mockImplementation(fake.eval);

    const run = () =>
      withUserLock('user-a', async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
      }, 'create-ad');

    await Promise.all(Array.from({ length: 5 }, () => run()));

    // Without this, `peak === 1` would also be what a version that never called
    // Redis at all would produce, because the event loop is single-threaded.
    // The lock has to have turned callers away for the exclusion to mean
    // anything.
    expect(fake.stats.attempts).toBeGreaterThan(5);
    expect(fake.stats.refused).toBeGreaterThan(0);
  });

  it('leaves no lock behind once the section finishes', async () => {
    const fake = fakeRedis();
    mocks.set.mockImplementation(fake.set);
    mocks.eval.mockImplementation(fake.eval);

    await withUserLock('user-a', async () => {}, 'create-ad');

    expect(fake.size()).toBe(0);
  });

  it('turns away a caller that arrives while the lock is still held', async () => {
    const fake = fakeRedis();
    mocks.set.mockImplementation(fake.set);
    mocks.eval.mockImplementation(fake.eval);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const secondSection = vi.fn();

    // The first section is held open until the second has given up, which is
    // past its retry budget -- the case where waiting stops being reasonable.
    const first = withUserLock('user-a', () => gate, 'create-ad');
    const second = await withUserLock('user-a', secondSection, 'create-ad').then(
      () => null,
      (error: unknown) => error
    );

    release();
    await first;

    expect(second).toBeInstanceOf(LockBusyError);
    expect(secondSection).not.toHaveBeenCalled();
  });
});