import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: option (c) from HANDOFF §2.2, decided 2026-10-03.
 *
 * **Local-only and run by hand.** There is no CI wiring here and there is no
 * database provisioning: `webServer` reuses whatever `pnpm dev` is already
 * running, and the suite runs against whatever `DATABASE_URL` points at. That is a
 * deliberate trade, and the alternatives were:
 *
 * - (a) a Neon branch per CI run -- most faithful, needs an API token as a CI
 *   secret plus branch create/drop and teardown-on-failure plumbing;
 * - (b) a `postgres` service container -- needs a driver swap, because
 *   `@neondatabase/serverless`'s HTTP driver will not talk to local Postgres over
 *   TCP. That is a change to the read and write path itself, to test the read and
 *   write path.
 *
 * Chosen because this project's E2E gap was never "no browser driver" -- a
 * Playwright MCP server was already configured, and every claim in `tasks/todo.md`
 * was verified through it. What was missing was *coverage*: MCP gave manual
 * verification that left no trace and failed silently when a step was skipped.
 *
 * **These tests are read-only, and that is a constraint rather than a
 * limitation.** Every spec here is an anonymous flow, so none of them can create,
 * report or delete anything. That is why they are safe to point at the shared
 * development database, and it is also why there is no coverage of the ad limit,
 * the report predicate or the moderation takedown: those need a signed-in session
 * and a disposable database, which is the work option (a) would buy. `§9.4`'s
 * acquire-loop contention question is answered the same way -- by a purpose-built
 * script against a throwaway user id, not by a suite that mutates shared state.
 *
 * Run with `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',

  /**
   * Fail the run on a single `test.only` left in a spec. The default is to warn,
   * which means a focused debug run can be committed and quietly reduce the suite
   * to one test without anybody noticing.
   */
  forbidOnly: !!process.env.CI,

  /**
   * No retries locally. A retry would hide exactly the flakiness this suite exists
   * to surface, and every spec here is a straight read against a local server.
   */
  retries: 0,

  /**
   * One worker. The specs share one development database and one dev server, and
   * parallel workers would make a failure depend on which specs happened to run
   * alongside it.
   */
  workers: 1,

  reporter: process.env.CI ? 'line' : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'pnpm dev',
    // An already-running dev server is reused rather than fought with: this
    // project is developed against a running server, and killing it to run the
    // suite would be a worse trade than sharing it.
    reuseExistingServer: true,
    url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    timeout: 120_000,
  },
});