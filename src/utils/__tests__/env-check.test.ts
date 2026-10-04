// @vitest-environment node
/**
 * The env checker must fail when it should.
 *
 * The trap this guards against is specific and has already happened once: a
 * checker that reports "set" for a variable that is absent is worse than no
 * checker, because it converts a silent production failure into a green tick.
 * That is the same lesson as §5's "a test that cannot fail is worse than no
 * test", applied to a script.
 *
 * The child processes are real rather than imported, because `dotenv/config`
 * repopulates `process.env` from `.env` on import — so unsetting a variable in
 * this process proves nothing, which is exactly how the first version of the
 * checker was fooled.
 *
 * **The environment is supplied by this file, not by `.env`.** `.env` is
 * gitignored, so a CI checkout has none, and the baseline case used to assert
 * against whatever the developer's own `.env` happened to contain. That test was
 * green here and red on every CI run — it could only be satisfied by a secret
 * file that is deliberately not committed. Each case now names the one variable
 * it is about and takes the rest of a complete environment from `COMPLETE`,
 * which also means a local `.env` can no longer change what these assert.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// `URL.pathname` percent-encodes, and this repository's path contains a space
// ("External drive"), which then does not resolve as a filesystem path.
// `fileURLToPath` decodes it. A test that silently spawns nothing and asserts
// on empty output would pass for entirely the wrong reason.
const script = fileURLToPath(new URL('../env-check.tsx', import.meta.url));

/**
 * Every variable `env-check.tsx` treats as required, present and non-blank, so
 * the checker's exit code is 0 unless a test removes one.
 *
 * The values are placeholders, not credentials: the checker only tests for a
 * non-empty trimmed string and never reads a variable's shape, which is the
 * checker's documented limitation (`HANDOFF.md` §1). Nothing here may ever be a
 * real secret.
 *
 * `dotenv` does not overwrite a variable that `process.env` already holds, and
 * `run` spreads `process.env` first, so these win over any local `.env`. That is
 * deliberate: the baseline must not depend on a file that is not committed.
 */
const COMPLETE = {
  MODERATORS: 'test-moderator-id',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  NEXTAUTH_SECRET: 'test-nextauth-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  UPLOADTHING_TOKEN: 'test-uploadthing-token',
} as const;

/**
 * The names `env-check.tsx` requires, read from its source rather than imported.
 *
 * `COMPLETE` has to name every one of them, or the baseline is not a complete
 * environment. That is easy to get wrong and hard to see, because `dotenv` fills
 * the gap from a local `.env` — so dropping `NEXTAUTH_URL` from `COMPLETE` keeps
 * all five cases green on a machine that has one, and turns two of them red in
 * CI, which is the exact asymmetry this file exists to remove. Asserting the
 * coverage here makes that mutation fail everywhere.
 *
 * Read from source because importing the script would *run* it (`main()` is
 * called at module scope) and exit the test process.
 */
async function requiredNames(): Promise<string[]> {
  const source = await readFile(script, 'utf8');

  // Only `REQUIRED` spells entries as `name: '…'`; `REPORTED` is a plain array of
  // strings and must not be picked up, since its absence is not an error.
  return [...source.matchAll(/name: '([A-Z_]+)'/g)].map(([, name]) => name);
}

/**
 * Runs the checker with `overrides` applied to the environment.
 *
 * An empty-string override is how a variable is made absent here: `dotenv` does
 * not treat `''` as a reason to reload, so the empty value survives and the
 * checker sees it. `-u` does not work, because dotenv fills the value back in.
 */
function run(overrides: Record<string, string>): {
  status: number;
  stdout: string;
} {
  try {
    const stdout = execFileSync('npx', ['tsx', script], {
      encoding: 'utf8',
      env: { ...process.env, ...overrides },
    });
    return { status: 0, stdout };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { status: e.status, stdout: e.stdout ?? '' };
  }
}

describe('env:check', () => {
  it('the test environment names every variable the checker requires', async () => {
    const required = await requiredNames();

    // Names only, no value check: this asserts coverage, and the values are
    // placeholders the checker never inspects. `REPORTED` is excluded on purpose
    // — its absence is reported, not an error.
    expect(Object.keys(COMPLETE).sort()).toEqual([...required].sort());
  });

  it('passes against a complete environment', () => {
    // The baseline: with everything present the exit code must be 0, or the
    // failures below would pass for the wrong reason.
    const { status } = run({ ...COMPLETE });
    expect(status, 'the checker failed against a complete environment').toBe(0);
  });

  it('fails when a required variable is empty', () => {
    // The real production failure: MODERATORS present in the dashboard but set
    // to nothing, or absent entirely. Both look identical to the checker.
    const { status, stdout } = run({ ...COMPLETE, MODERATORS: '' });

    expect(status, 'an empty MODERATORS passed the check').not.toBe(0);
    expect(stdout).toContain('MODERATORS');
  });

  it('fails when a required variable is whitespace only', () => {
    // `parseModeratorAllowlist` trims and drops empty entries, so " " produces
    // an empty set and the same silent refusal. The checker must agree.
    const { status } = run({ ...COMPLETE, MODERATORS: '   ' });
    expect(status, 'whitespace-only MODERATORS passed the check').not.toBe(0);
  });

  it('names the dashboard, because .env does not travel to Vercel', () => {
    // The instruction that would actually have prevented the outage. If this
    // assertion fails, the fix message no longer tells the reader what to do.
    const { stdout } = run({ ...COMPLETE, MODERATORS: '' });

    expect(stdout).toContain('Vercel');
    expect(stdout).toMatch(/per environment/i);
  });

  it('tells the reader a pass does not prove production', () => {
    // The checker's real limitation: it reads this process's environment and
    // cannot see Vercel's. Saying so is the difference between a green run and
    // a false sense of security.
    const { stdout } = run({ ...COMPLETE });

    expect(stdout).toMatch(/nothing about Vercel/i);
  });
});