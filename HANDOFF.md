# HANDOFF

State of the repository and what to do next, for a reader with no memory of the
work. Deliberately short: anything recoverable from `git log`, the code
comments, or the README is not repeated here. If you want the history of a
decision, `git log -S` finds it; if you want its current shape, the file says so.

- **Branch:** `main`, clean, in sync with `origin/main`
- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 217 tests
  across 22 files, `next build` succeeds. CI is green on `main`.
- **Database:** one Neon database shared by development and production (§4).
  ~200 generated ads, no real user data.

---

## 1. Environment facts that will otherwise waste your time

1. **Use `pnpm` 11.1.3.** The global `pnpm` here is 9.0.0 and fails with
   `ERR_PNPM_UNEXPECTED_STORE`. Run `corepack enable`, or `npx pnpm@11.1.3 <cmd>`.
2. **`pnpm-workspace.yaml` is not a workspace file** — it exists only to hold
   `allowBuilds`. Do not add a `packages:` key; this is a single-package repo.
   `sharp` is intentionally not built (Vercel supplies it for `next/image`).
3. **Upstash Redis does not resolve from this machine** (`ENOTFOUND`). Anything
   touching Redis is mocked or intercepted in tests and has **never run against
   a live instance**. See §2.1.
4. **Postgres is fully reachable and `CREATE DATABASE` is permitted**, which is
   how the migration work was verified rather than assumed. Two consequences:
   - The connection string uses the **`-pooler` host**. Those sessions outlive
     the process, so a scratch database cannot be dropped until its idle
     sessions are terminated:
     ```sql
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = '<db>' AND pid <> pg_backend_pid();
     ```
   - `tsx` scripts importing `dotenv/config` must live **inside the repo**; from
     `/tmp` the module does not resolve.

---

## 2. Open work

Nothing here is blocking. §2.3 is the largest piece; the ad-limit invariant in
§5 is the natural next *schema* change, now that migrations exist.

### 2.1 The Lua release script has still never been executed

`RELEASE_SCRIPT` in `src/server/user-lock.ts` is text-pinned by a test and
reviewed by eye, but never run, because Redis is unreachable (§1, item 3).

The two assumptions it rested on were about the `@upstash/redis` *client*, and
a client can be exercised without a server — the library calls the bare global
`fetch`. `src/server/__tests__/redis-client-contract.test.ts` does that and now
pins both: `set(..., {nx:true})` answers `'OK'`/`null`, and `eval` sends
`["eval", script, numkeys, ...keys, ...args]` with bare unquoted strings, so
`ARGV[1]` is the token. Verified by mutation — dropping `nx`, passing the wrong
token, passing the key as an argument, and reading a lost lock as a release each
turn the suite red.

**Executing the Lua needs a real Redis, not a cleverer fake.** `luajit` is
installed locally, so the script could run against a hand-written `redis.call`
stub — but that stub would encode the very token comparison under test and pass
whatever the script said. A working `UPSTASH_REDIS_REST_URL`, or a local Redis
over HTTP, is the only honest way to close this.

### 2.2 Decide on end-to-end tests (blocked on your decision)

Every route is dynamic and reads Postgres, so an E2E run needs a database this
repo does not provision. Pick one:

- **(a) A Neon branch per CI run.** Most faithful; needs a Neon API token.
- **(b) A `postgres` service container.** Simplest, but the app uses
  `@neondatabase/serverless` (HTTP driver), which will not talk to a local
  Postgres over TCP. Needs a driver swap behind an env check.
- **(c) Local-only.** Playwright config with `webServer`, run by hand before
  release, not in CI.

Then cover, in priority order: browse → region filter → load more → ad detail →
intercepting modal → 404 for a deleted ad. Anonymous flows only.

### 2.3 Smaller items

- **`contactPhone` is visible to any signed-in user, not just the owner.**
  Predates the review work and looks intentional. If the threat model is
  "contact data must not leak", gate it on
  `currentUser?.userId === ad.userId` in `AdCardCompact.tsx`.
- **`next-auth` v5** is `5.0.0-beta.32` — beta after three years. The ownership
  model no longer depends on the version. Revisit only if v5 goes stable.
- **Deferred upgrades**, one per change with a green suite either side: `motion`
  12→13, `eslint` 9→10, `@types/node` 20→26, `typescript` 5→7.
- **`next@16.3.7`** exists but was published 2026-09-29. This machine's
  `~/.npmrc` sets `min-release-age=3` days, which pnpm surfaces as
  `minimumReleaseAge: 4320` minutes. That is a **machine** supply-chain guard,
  not a repo setting — do not go looking for it in `pnpm-workspace.yaml`, and do
  not disable it. 16.3.6 is the newest version past that window.

---

## 3. Decisions that look like mistakes but are not

Each is deliberate, reasoned in the file named, and pinned by a test where a
comment would not hold.

**`upload-guard.ts` fails closed.** It awaits `ratelimit.limit()` with no
`try/catch`, so an unreachable Redis breaks uploads. Keep it that way. A quota is
not an authorization boundary, so the ad lock fails open and logs; but here the
mechanism *is* the control, so failing open would mean an outage becomes an
abuse window. Pinned by `fails closed when the rate limiter is unreachable` —
**do not "fix" this toward consistency with the ad lock.**

**The ad lock is advisory, not authoritative.** If Redis is down the critical
section still runs, unserialized, and logs. A soft quota should not become a hard
availability dependency.

**The database cannot enforce the ad limit, and that was measured.** Do not
re-derive it: `db.transaction` throws on the neon-http driver; a
single-statement `pg_advisory_xact_lock` does not help, because under READ
COMMITTED a blocked caller proceeds with a snapshot from *before* the winner
committed and its `count(*)` cannot see the new row (eight concurrent inserts
breached a limit of two in five rounds of six). A **trigger has the same
defect**, running inside the INSERT's snapshot. A partial unique index can only
express "at most 1". Hence mutual exclusion outside the database, hence Redis.

**One database for dev and production.** Found, not designed: Vercel's
`DATABASE_URL` points at the dev database and `.env` is copied to the Vercel
host. Kept, because for a portfolio project with no real users production keeps
demonstrating itself. **Do not "create a second database" as a fix.** Real users
appearing is the trigger to revisit. The `SEED_ALLOW` guard
(`src/utils/seed-guard.ts`) covers CI and a fresh clone but **not** production,
since `.env` travels to the Vercel host; that limit is stated in the guard's
header rather than papered over.

**Not done, on purpose:** no E2E (§2.2), no React Compiler (stable in Next 16,
not enabled), loading states not revisited (three `loading.tsx` files render a
bare `Spinner`), no `CONSTRAINTS.md` (the `constraint-driven-development` skill
would add one).

---

## 4. Traps

Each of these cost real time. The first four are driver or library behaviour
that reads correctly and is wrong.

- **The neon HTTP tagged template binds *everything*.** Any interpolation becomes
  a `$1` parameter, so an identifier or array passed through it yields
  `INSERT INTO $1` or `malformed array literal`. Use
  `sql.query('... VALUES ($1,$2)', [a, b])` when a statement needs both a
  literal table name and bound values. Three separate bugs were this.
- **A unique violation does not arrive where you look.** Drizzle wraps driver
  errors, so 23505 reaches you as a `DrizzleQueryError` with `code: undefined`;
  the real `NeonDbError` is on **`.cause`**. Retry logic must read
  `error.cause.code`. Verified against the live DB with a self-selecting insert,
  which guarantees the violation and writes nothing.
- **`Redis.fromEnv()` does not throw when the variables are missing** — it warns
  at construction and returns a client that fails on every call. Importing the
  module proves nothing about configuration. Set the variables in
  `vi.hoisted`, before the import runs.
- **The Redis client's `signal` is a factory evaluated per HTTP request**, not
  per command, so `retries: N` multiplies the effective per-command timeout.
  That is why `MAX_SET_CALL_MS` is `timeout * (retries + 1)`, and why the acquire
  loop is bounded by wall-clock rather than by a count of sleeps.
- **`getTableConfig(table).columns` is an array** on drizzle-orm 0.45, not a
  name-keyed record. `Object.keys()` over it yields `'0'`, `'1'`, … and a test
  built on that asserts nothing while looking correct.
- **`tsx` compiles to CJS here** (no `"type": "module"`), so top-level `await`
  fails in a scratch script. Wrap it in an async function.
- **`drizzle-kit migrate` exits non-zero on failure but prints nothing about
  what failed.** Diagnosing a failed migration means running the SQL by hand.
  (`db:baseline`'s own errors do explain themselves.)
- **Excess-property checking does not reach through `flatMap` inference.** A seed
  builder set a column that does not exist and `tsc` was silent; the insert
  succeeded anyway. That is why the seed tests compare against
  `getTableColumns` and derive the required set from `hasDefault`.

Component-test specifics: `AdGrid` and `AdPhotosGallery` need `vi.mock` for
`next/navigation` and `../ToastProvider` (`useSearchParams` returns null outside
a router); `RegionSelectBlock` is `display: none` under jsdom, so queries need
`{ hidden: true }`; Radix `Select` will not open its portal in jsdom while the
trigger is hidden, so the "pick a region" path wants E2E.

---

## 5. Testing conventions

The recurring lesson of this repo's testing history: **a test that cannot fail is
worse than no test**, because it is read as proof. Every rule below exists
because its violation shipped.

- **Before believing a test proves something, revert the fix and confirm it
  fails.** The `expect(mocks.x).toHaveBeenCalled()` shape proves nothing.
- **Assert on what the code under test produced, not on what the test produced.**
  The first `redis-client-contract.test.ts` called `redis.set` itself and
  supplied its own `nx: true`; it passed unchanged after `nx` had been deleted
  from `user-lock.ts`. Every assertion in it is now against a command
  `withUserLock` itself issued.
- **Check that a test can fail at all.** One asserted
  `attempts * backoff < TTL`, which held for the life of the lock while the
  property it named was routinely violated — latency was in none of the terms. If
  a constant cannot influence the assertion, the assertion is decorative.
- **A hand-written fake must not model the property under test.** An early Redis
  fake rejected a held key whether or not `nx` was set, so deleting `nx` still
  passed. Model the real primitive: without `NX`, `SET` overwrites and returns OK.
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even
  when the check is removed.
- **Assert contention actually happened.** With a single-threaded runtime and an
  in-process fake, "peak concurrency 1" is also what a version that never called
  Redis would produce. Pair it with an assertion that the fake turned callers
  away.
- **Restore a spy only after asserting on it.** `mockRestore()` also resets
  `mock.calls`, so restoring in a `finally` and asserting afterwards reads an
  empty list.
- **Say what a test catches, not what you hope it catches.** A test that the
  acquire deadline is *derived* passes just as well against a hardcoded literal
  holding today's value; its comment says "drift, not hardcoding" because that
  is the truth.
- **A reviewer's finding is data, not a verdict.** Several confidently asserted
  findings in this repo's history were wrong. Re-read the artifact before acting.
- **Never write an unscoped `db.delete`** in a file described as temporary,
  especially next to a real database. It happened twice here, both times against
  the shared database, and both times restored only because the data was
  regenerable. Prefer no delete at all: seeding is additive, so restoring is
  `pnpm db:seed` again. If a delete is unavoidable, scope it by a known test
  marker — **never by a timestamp**, because a seeded batch shares one
  `createdAt` and any cutoff computed from the data is the same fact as the data.

Server-side test files start with `// @vitest-environment node` (the default is
jsdom). Tests live in `__tests__` folders beside the code.

---

## 6. Migrations

`drizzle/` is committed, with `db:generate`, `db:migrate` and `db:baseline`. CI
runs `db:generate` and fails if it produces a diff, so a schema change cannot
reach production without its migration.

`generate` compares `src/server/db/schema.ts` against
`drizzle/meta/_journal.json`, not against a live database, so a create-from-zero
baseline falls out of an empty `drizzle/` offline. No scratch database is needed
to *write* a migration, only to verify one — and `CREATE DATABASE` is permitted
here, so the migration set was verified against real scratch databases rather
than reasoned about.

**Adopting this on a database that predates it:** `db:migrate` would try to
`CREATE TABLE` and fail, because the schema is already there via `db:push` and
there is no migration row. `pnpm db:baseline` records the baseline as applied
without running it. It **refuses unless both tables are present**, since
baselining an empty database would leave `db:migrate` convinced the schema
exists — a silent failure, much harder to diagnose than a refusal.

**Dev is baselined. Production is not**, and cannot be until it has its own
credentials. Nothing is blocked on it: the migration set is a verified superset
of the schema dev actually has, so the worst case is that production needs
`db:baseline` before its first `db:migrate`.

---

## 7. The next schema change, when you take it

The ad limit is not a database invariant — it is serialized in application code
and degrades to unenforced if Redis is down. A hard guarantee is a `slot smallint`
with `UNIQUE(userId, slot)` and retry-on-conflict, which Postgres can enforce
without transactions. That was blocked on the migration system not existing; it
exists now (§6).

Two things measured against the live database, so they need not be rediscovered:

- **Read the error code off `.cause`** — see §4.
- **The backfill is unobstructed.** 201 ads across 201 distinct users, so no user
  holds more than one, every row can take `slot = 0`, and nothing in the existing
  data blocks the index.

Note the related known limitation: the lock and the count both key on the OAuth
provider account id, so a person signing in with both GitHub and Google has two
ids and can hold 4 ads. Pre-existing, now encoded in the lock key rather than
fixed.
