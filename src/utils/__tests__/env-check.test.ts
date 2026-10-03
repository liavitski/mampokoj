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
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// `URL.pathname` percent-encodes, and this repository's path contains a space
// ("External drive"), which then does not resolve as a filesystem path.
// `fileURLToPath` decodes it. A test that silently spawns nothing and asserts
// on empty output would pass for entirely the wrong reason.
const script = fileURLToPath(new URL('../env-check.tsx', import.meta.url));

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
  it('passes against this repository’s own .env', () => {
    // The baseline: with everything present the exit code must be 0, or the
    // failures below would pass for the wrong reason.
    const { status } = run({});
    expect(status, 'the checker failed against a complete .env').toBe(0);
  });

  it('fails when a required variable is empty', () => {
    // The real production failure: MODERATORS present in the dashboard but set
    // to nothing, or absent entirely. Both look identical to the checker.
    const { status, stdout } = run({ MODERATORS: '' });

    expect(status, 'an empty MODERATORS passed the check').not.toBe(0);
    expect(stdout).toContain('MODERATORS');
  });

  it('fails when a required variable is whitespace only', () => {
    // `parseModeratorAllowlist` trims and drops empty entries, so " " produces
    // an empty set and the same silent refusal. The checker must agree.
    const { status } = run({ MODERATORS: '   ' });
    expect(status, 'whitespace-only MODERATORS passed the check').not.toBe(0);
  });

  it('names the dashboard, because .env does not travel to Vercel', () => {
    // The instruction that would actually have prevented the outage. If this
    // assertion fails, the fix message no longer tells the reader what to do.
    const { stdout } = run({ MODERATORS: '' });

    expect(stdout).toContain('Vercel');
    expect(stdout).toMatch(/per environment/i);
  });

  it('tells the reader a pass does not prove production', () => {
    // The checker's real limitation: it reads this process's environment and
    // cannot see Vercel's. Saying so is the difference between a green run and
    // a false sense of security.
    const { stdout } = run({});

    expect(stdout).toMatch(/nothing about Vercel/i);
  });
});