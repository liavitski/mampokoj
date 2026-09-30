// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Pins the `@upstash/redis` behaviour `withUserLock` depends on, by watching
 * the bytes the real lock puts on the wire.
 *
 * The lock is the one part of this app whose correctness rests on two facts
 * about a third-party client that cannot be read off this repository's own code:
 *
 *   1. `set(key, token, { nx: true })` answers exactly `'OK'` when it wins the
 *      race and `null` when it loses it, and
 *   2. `eval(script, keys, args)` puts `keys.length` on the wire followed by the
 *      keys and args as bare strings, so `ARGV[1]` is the token itself.
 *
 * Both were checked against the installed package source and neither could fail
 * a test, so a `^1.39.0` bump could change either and nothing would notice. The
 * consequence of (2) breaking is quiet rather than loud: the release script would
 * compare the stored token against a quoted string, never match, and the lock
 * would be deleted by nobody and left to expire on its TTL every time.
 *
 * ## Why this drives `withUserLock` rather than calling the client directly
 *
 * An earlier version of this file called `redis.set`/`redis.eval` itself and
 * asserted on the result. That passed even after `nx: true` had been deleted
 * from the lock, because the test supplied its own `nx` and so was pinning the
 * library while saying nothing about the caller. Every assertion here is
 * therefore made against a command the lock itself issued.
 *
 * The client is the real one, with only the bare global `fetch` it calls
 * replaced -- so no Redis, no network, and no mock of this repo's own code.
 *
 * ## What this still cannot do
 *
 * Execute the Lua. Redis is unreachable from the development machine, so the
 * script's *text* stays pinned by `user-lock.test.ts` and its *behaviour* is
 * reviewed rather than run. Closing that needs a real Redis, not a cleverer fake:
 * a hand-written `redis.call` stub would encode the very token comparison under
 * test and pass no matter what the script said.
 */

/**
 * Set before any import runs, because ES module imports hoist above statements.
 *
 * `Redis.fromEnv()` is called at module scope in `src/server/redis.ts`. It does
 * not throw when the variables are missing -- it warns and returns a client with
 * no url and no token -- so setting them after the import would leave every test
 * running against a client that was never configured. The fake `fetch` would
 * answer regardless, the assertions would still pass, and the suite would be
 * quietly testing a client that cannot exist in production.
 */
vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL ??= 'http://127.0.0.1:1';
  process.env.UPSTASH_REDIS_REST_TOKEN ??= 'test-token';
});

/**
 * One recorded command: the positional array the client serialized, e.g.
 * `['set', 'key', 'token', 'nx', 'px', 10000]`.
 */
type WireCommand = (string | number)[];

/**
 * Records every command the client sends, so an assertion can be made about the
 * bytes rather than about a return value the test chose itself.
 *
 * Hoisted so the recorder exists before the mocked module is built, and shared
 * with the `fetch` helpers below.
 */
const { sent, resetSent } = vi.hoisted(() => {
  const sent: (string | number)[][] = [];

  return { sent, resetSent: () => sent.splice(0) };
});

vi.mock('@/server/redis', async () => {
  // The real client, so what is asserted is the real serialization. Only the
  // module's own binding is swapped, and only for the transport.
  const { Redis } = await import('@upstash/redis');

  const actual = await vi.importActual<typeof import('@/server/redis')>(
    '@/server/redis'
  );

  const client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    retry: { retries: 0 },
  });

  return { ...actual, redis: client };
});

const { withUserLock, __testing } = await import('../user-lock');

const { LOCK_TTL_MS, RELEASE_SCRIPT } = __testing;

const USER = 'user-a';
const LOCK_KEY = `mampokoj:lock:create-ad:${USER}`;

/**
 * A `fetch` that answers each command with `answerFor`.
 *
 * `SET NX` answers 'OK' when it wins and null when it loses; the release script
 * answers 1 when it deleted the key and 0 when the token did not match. Both
 * are the values `withUserLock` branches on.
 */
function fetchAnswering(answerFor: (command: WireCommand) => unknown) {
  return (async (_url: string, init: RequestInit) => {
    // The client auto-pipelines, so a request body is an array of commands even
    // for one of them, and an array is the only shape it can read a reply from.
    // Replying with a bare object fails deep in the library with
    // `res.map is not a function`, which says nothing about the contract.
    const body = JSON.parse(String(init.body)) as WireCommand[];

    sent.push(...body);

    return new Response(
      JSON.stringify(body.map((command) => ({ result: answerFor(command) }))),
      { headers: { 'content-type': 'application/json' } }
    );
  }) as typeof globalThis.fetch;
}

/** The ordinary path: the lock is won, and the release deletes the key. */
const lockAcquiredThenReleased = fetchAnswering((command) =>
  command[0] === 'set' ? 'OK' : 1
);

/** The lock stays held by somebody else, so every `SET NX` loses the race. */
const lockHeldElsewhere = fetchAnswering(() => null);

/** Acquired, but the release finds the token gone: the lock was lost. */
const lockLostBeforeRelease = fetchAnswering((command) =>
  command[0] === 'set' ? 'OK' : 0
);

/** Runs the lock once and returns the commands it sent. */
async function runLock(fn: () => Promise<unknown> = async () => {}) {
  resetSent();
  vi.stubGlobal('fetch', lockAcquiredThenReleased);

  try {
    await withUserLock(USER, fn, 'create-ad');
  } finally {
    vi.unstubAllGlobals();
  }

  return sent;
}

/** The command whose name matches, so ordering is not asserted. */
function commandNamed(commands: WireCommand[], name: string): WireCommand {
  const found = commands.find((command) => command[0] === name);

  expect(found, `no ${name} command was sent`).toBeDefined();

  return found!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSent();
});

describe('SET NX, the mutual exclusion primitive', () => {
  it('sets the lock key only if absent, with a TTL', async () => {
    const commands = await runLock();

    // Without `nx` every caller would overwrite the key and every one of them
    // would believe it held the lock. Asserted on the command the lock sent, so
    // deleting `nx` from user-lock.ts fails here.
    expect(commandNamed(commands, 'set')).toEqual([
      'set',
      LOCK_KEY,
      expect.any(String),
      'nx',
      'px',
      LOCK_TTL_MS,
    ]);
  });

  it('answers OK when it wins the race, which is the only value it accepts', async () => {
    vi.stubGlobal('fetch', lockAcquiredThenReleased);

    try {
      // The lock treats anything other than 'OK' as "somebody else won", so a
      // client answering '1' or true would make every create report itself
      // blocked. The section running at all is the assertion: it only runs on
      // 'OK'.
      await expect(
        withUserLock(USER, async () => 'created', 'create-ad')
      ).resolves.toBe('created');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('runs no section when the lock is held elsewhere', async () => {
    // A lost race answers null. This is the path that turns a double submit
    // into "try again in a moment" rather than a second ad.
    vi.stubGlobal('fetch', lockHeldElsewhere);

    const section = vi.fn(async () => 'created');

    try {
      await expect(withUserLock(USER, section, 'create-ad')).rejects.toThrow(
        'Lock is held by another request'
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(section).not.toHaveBeenCalled();
  });
});

describe('EVAL, the release path', () => {
  it('sends the script with a numkeys entry, then the key and the token', async () => {
    const commands = await runLock();

    // Redis reads numkeys off position 1 of the command. Without it, KEYS[1]
    // resolves to the token instead of the lock and the script never matches.
    const evalCommand = commandNamed(commands, 'eval');

    expect(evalCommand[1]).toBe(RELEASE_SCRIPT);
    expect(evalCommand[2]).toBe(1);
    expect(evalCommand[3]).toBe(LOCK_KEY);
  });

  it('sends the very token the lock set, unquoted', async () => {
    const commands = await runLock();

    const setToken = commandNamed(commands, 'set')[2];
    const evalToken = commandNamed(commands, 'eval')[4];

    // The release only deletes the key when ARGV[1] equals what SET stored. Had
    // the client serialized the token as JSON, the script would compare against
    // '"<token>"' -- quote characters included -- never match, and every release
    // would leave the key behind for a full TTL. This is the quiet failure the
    // file exists to catch, and it is why the arg must be the bare string.
    expect(evalToken).toBe(setToken);
    expect(typeof evalToken).toBe('string');
  });

  it('reports a lost lock when the script declines to delete', async () => {
    // The script answers 0 when the token did not match, i.e. the TTL expired
    // and somebody else holds the lock now. That means two critical sections may
    // have overlapped, which must never be silent.
    vi.stubGlobal('fetch', lockLostBeforeRelease);

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await withUserLock(USER, async () => {}, 'create-ad');
    } finally {
      vi.unstubAllGlobals();
    }

    // Asserted before the spy is restored: `mockRestore` also resets
    // `mock.calls`, so restoring it in a `finally` and asserting afterwards
    // reads an empty list and fails for a reason that has nothing to do with
    // the lock. That is the "assertion that cannot fail" shape, arrived at from
    // the other direction.
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('overlapped')
    );

    logged.mockRestore();
  });
});
