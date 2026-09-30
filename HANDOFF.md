# HANDOFF

State of the repository and what to do next. Written to be read cold, with no
memory of the work that produced it.

- **Branch:** `security/harden-server-actions` (24 commits ahead of `main`, unpushed)
- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 211 tests
  across 21 files, `next build` succeeds
- **Stack:** Next.js 16.3.6, React 19.3, pnpm 11.1.3, TypeScript 5, Drizzle +
  Neon Postgres, NextAuth v4, UploadThing, Upstash, styled-components v6, Vitest
- **Database:** one Neon database, shared by development and production
  (§3.9). Holds ~200 generated ads and their images, no real user data.

---

## 1. Read this first

Four environment facts that will otherwise waste your time:

1. **Use `pnpm` 11.1.3.** `packageManager` is pinned. The global `pnpm` on this
   machine is 9.0.0 and will fail with
   `ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION` / `ERR_PNPM_UNEXPECTED_STORE`.
   Run `corepack enable`, or invoke `npx pnpm@11.1.3 <cmd>`.
2. **`pnpm-workspace.yaml` is not a workspace file.** It exists only to hold
   `allowBuilds`. Do not add a `packages:` key; this is a single-package repo.
   `sharp` is intentionally not built (Vercel supplies it for `next/image`).
3. **Upstash Redis is unreachable from this machine.** The host in `.env`
   (`polite-civet-146529.upstash.io`) does not resolve — `ENOTFOUND`. Anything
   touching Redis is therefore mocked in tests and has **never been run against
   a live instance**. See §3.1.
4. **Postgres is fully reachable, and `CREATE DATABASE` is permitted.** This is
   how §3.4 was verified rather than assumed. Two things follow:
   - The connection string uses the **`-pooler` host**. Those sessions survive
     the process, so a scratch database cannot be dropped until its idle
     sessions are terminated first:
     ```sql
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = '<db>' AND pid <> pg_backend_pid();
     ```
   - `tsx` scripts importing `dotenv/config` must live **inside the repo** —
     from `/tmp` the module is not resolvable.

---

## 2. What was just done

Seventeen commits. The first eleven were a review-and-harden pass over a
codebase with zero tests and zero CI. `f026035` rewrote the README and wrote
this document; four commits of new work are in §2.1–§2.5, interleaved with three
updates to this file.

| Commit | What |
| --- | --- |
| `efeb035` | Pin pnpm 11.1.3; add Vitest harness. Fixes installs that were completely broken. |
| `a60b4cf` | `updateAd` ownership check — was a live vulnerability |
| `13354ca` | `addImageToAd` derives owner from session, not arguments — was live |
| `8f3e7dd` | `/api/ads` stopped leaking `userId` + `contactPhone`; input validation |
| `fb54d62` | Server-side zod validation; ad limit enforced server-side |
| `e9bfc39` | Upload ownership checked *before* storing; `deletePhoto`/`deleteAd` hardened |
| `654b1a0` | Correctness bugs: 404s, grid crash, date off-by-one, CSS, gallery index |
| `3c33b1d` | Session read once per request (was ~6 reads per dashboard render) |
| `1323220` | Dead code + unused deps removed; bumped to Next 16.3.6; lint to 0 warnings |
| `31a6899` | GitHub Actions CI: lint → typecheck → test → build |
| `97c1cac` | `fileKey` leak found in review; `addImageToAd` de-published as an RPC; weak tests tightened |
| `f026035` | Rewrite the README; add this handoff document |
| `ff3d0e1` | Seed script made runnable and covered |
| `8942bbb` | Ad creation serialized behind a per-user Redis lock |
| `05fd3e5` | This file: seed and ad-lock work |
| `b891481` | Acquire loop bounded by wall-clock; a second model found the first attempt at it did not hold |
| `5471215` | This file: second-model review |
| `56e071c` | Upload guard: decided to fail closed, documented and pinned by a test (§3.2) |
| `14b1b86` | Tracked migrations in `drizzle/`, plus `db:baseline` (§3.4) |
| `6d202b3` | CI fails on schema drift; README documents the migration loop (§3.4) |
| `baac935` | This file: upload-guard decision and tracked migrations |
| `4dc798c` | `pnpm db:seed` refuses unless `SEED_ALLOW` names the database; plus a second seed-data incident (§3.9) |
| `5d9e51a` | Correct the handoff commit count and complete its table |
| `4072699` | Describe the single database accurately, not a false guarantee (§3.9) |

### 2.1 Seed script (`ff3d0e1`)

Split into `src/utils/seed-data.ts` (pure builders, no db import) and a thin
`src/utils/seed.tsx`. Added `pnpm db:seed`. Two real defects surfaced, both
found by the new tests rather than by reading:

- `faker.phone.number()` produced `(774) 128-456`, which `adInputSchema`
  rejects and `formatCZPhone` renders verbatim — every seeded ad had a garbled
  phone number. Now `+420` plus nine digits.
- `faker.date.future()` returns an arbitrary instant, but `availableFrom` is a
  calendar date anchored at UTC midnight, so a seeded ad shifted by a day on any
  edit round trip off-UTC. Now normalised to UTC midnight.

**The handoff's third claim was wrong.** The previous version of this document
said the seed "throws" because it set `userId` on an `images` row. It does not:
Drizzle ignores the unknown key at runtime, and `tsc` never caught it either
(excess-property checking does not reach through `flatMap` inference). The
insert succeeded. The key was removed anyway — `images` reaches a poster only
through `adId`, so it was meaningless — but the script had not been broken.

The tests compare generated image rows against `getTableColumns(images)`, so a
column that is not in the schema fails a test rather than an insert, and derive
the required-column set from `hasDefault` so a new notNull column without a
default breaks the suite.

### 2.2 Ad limit (`8942bbb`)

`createAd` counted and then inserted in two statements with nothing between
them, so concurrent requests all read the same count and all inserted. Both
statements now run inside `withUserLock` (`src/server/user-lock.ts`), a
per-user Redis mutex keyed on the session user.

### 2.3 The measurement that decided it

Do not re-derive this. The obvious database-native fixes were tested against the
real Neon database and **do not work**:

- `db.transaction` throws `No transactions support in neon-http driver`.
- A single-statement `pg_advisory_xact_lock` does not work. Under READ
  COMMITTED a statement's snapshot is fixed when the statement begins, so a
  caller that blocks on the lock proceeds with a snapshot from *before* the
  winner committed, and its `count(*)` cannot see the new row. Eight concurrent
  inserts breached a limit of two in **five rounds out of six**. The one round
  that held was luck — a control run without the lock was required to see this.
- A **DB trigger has the same defect**, since it runs inside the INSERT's
  snapshot. This rules out the usual "move the check into the database" answer.
- A partial unique index can only express "at most 1", not "at most 2".

What is left is mutual exclusion outside the database, hence Redis.

### 2.4 Adversarial review findings, and which were real

The lock got a fresh-context adversarial review before commit. Of 14 findings,
these were genuine and are fixed:

- The shared client had **no request timeout**, so a Redis stall hung the
  request rather than degrading it. `signal: () => AbortSignal.timeout(2000)`.
- The library's default retry is 5 attempts with `exp(n)*50` backoff, so the
  `catch` meant to degrade gracefully ran ~4.3s late.
- The first thrown error abandoned the entire retry budget.
- The degraded path never released the lock, so a request that failed *after*
  Redis applied it would block that user for the full TTL.
- The release result was discarded, so a lost lock (overlapping critical
  sections) was completely silent.
- An unrecognised `SET NX` return value was read as "busy", which would make
  every create fail permanently with no log line.
- `src/server/redis.ts` was missing `import 'server-only'` while holding the
  Redis token.
- The outer `catch` in `createAd` logged a bare string with no cause, against
  repo convention.

**Rejected as incorrect:** the review claimed the mutual-exclusion test could
not fail if `nx` were removed. It can — verified by mutation, four tests fail.
The claim was not re-checked against the code before being asserted.

### 2.5 A second model's review, and the defect mine missed (`b891481`)

The lock was reviewed twice: once by a fresh-context reviewer of the same model
family, then by `opencode/nemotron-3-ultra-free` with the same adversarial
prompt. The second review found something the first did not, and it was real.

**The defect.** The acquire-budget test asserted
`ACQUIRE_ATTEMPTS * ACQUIRE_BACKOFF_CAP < LOCK_TTL` — roughly 2000 < 10000, and
it passed. But that counts only *sleep* time, and per-call latency is most of
the budget: each `redis.set` can occupy
`REDIS_REQUEST_TIMEOUT_MS * (retries + 1)`, because `signal` is a factory
evaluated per HTTP request rather than per command. Ten slow attempts ran for
well over a minute against a 10s TTL.

**The consequence** was exactly what the code's comment claimed could not
happen: a waiter could outlive the lock it was waiting for, watch that lock
expire and be taken by somebody else, then acquire "successfully" and enter the
critical section alongside the current holder, believing it was exclusive.

**The fix.** Bound wall-clock instead of a sum of sleeps, and derive the
deadline from the client's own settings, so retuning the timeout moves the
deadline with it. The winning attempt may still begin just before the deadline,
so the invariant is *deadline + one full call < TTL*, with margin for clock
skew.

Verified by mutation: removing the wall-clock break fails the slow-Redis test
(it runs 4.6s, which is the old behaviour), and dropping the safety margin
fails two invariant tests.

**Wrong, and rejected on inspection:**

- Claimed `Redis.fromEnv()` warns only at request time. It warns at
  construction — `nodejs.mjs:274-278`.
- Claimed `expectHeld` does not distinguish "lost the lock" from "never held
  it". It does: `false` on the degraded path, `true` only in the `finally`
  after a confirmed `'OK'`.
- Claimed "Please try again in a moment" is misleading. It is exactly right for
  the dominant case, which is the user's own double-submit.

**The lesson worth more than the fix:** the flawed test asserted a formula
about the *wrong quantity*. It could not fail, because no value of
`ACQUIRE_ATTEMPTS` or the backoff constants would have made it notice latency.
A reviewer looking at the code rather than trusting the suite found it. Read
§4's testing conventions on this before writing the next guard.

---

## 3. Next steps, in recommended order

Nothing in §3.1–§3.9 is blocking. §3.1 is the largest untouched surface and
§3.5 the largest piece of work; the ad-limit invariant in §6 is the natural
next *schema* change now that migrations exist.

### 3.1 The Lua release script is reviewed, not verified

`RELEASE_SCRIPT` in `src/server/user-lock.ts` is the one piece of the lock that
has never been executed, because Redis does not resolve from this machine
(§1.3). It is text-pinned by a test and reviewed by eye. Its correctness rests
on two unverified assumptions:

1. `redis.set(key, token, { nx: true })` returns exactly `'OK'` on success and
   `null` on a lost race, in `@upstash/redis` 1.39.0.
2. `redis.eval(script, keys, args)` emits `["eval", script, keys.length, ...keys,
   ...args]` with strings unquoted, so `ARGV[1]` is the bare token.

Both were checked against the installed package source, but neither was run. The
dependency is `^1.39.0`, so a minor bump can change either without a failing
test. Getting a working `UPSTASH_REDIS_REST_URL`, or standing up a local Redis
reachable over HTTP, would close this.

### 3.2 `upload-guard.ts` — decided: fail closed (`56e071c`)

`checkUploadAdmission` awaits `ratelimit.limit()` with no `try/catch`. If Redis
is unreachable this throws out of the UploadThing middleware and uploads break.

**Decided: keep failing closed.** The asymmetry with the ad lock is deliberate
and the reasons are now written into the file, so the next reader does not read
it as an oversight:

- A quota is not an authorization boundary, so unreachable Redis should not take
  ad creation down. That lock fails open and logs.
- Here the mechanism *is* the control. Failing open would mean the rate limit
  could be switched off by making Redis unreachable — an outage becomes an abuse
  window. An unattached file is also a real cost, billed before admission is
  decided.

A comment is not a guard, so a test pins it: `fails closed when the rate
limiter is unreachable`. Verified by mutation — adding a `try/catch` turns it
red. **Do not "fix" this toward consistency with the ad lock.**

### 3.3 Open questions — none open

All three are settled.

1. **`upload-guard` fail open or closed** — fail closed, decided and pinned by a
   test. §3.2.
2. **Generate the baseline from a scratch database?** — not necessary at all.
   `generate` compares the schema to the migration journal, not to a live
   database, so a create-from-zero set falls out of an empty `drizzle/`. §3.4.
3. **Do dev and prod schemas match?** — there is only one database, so the
   question dissolved. §3.9.

### 3.4 Tracked migrations — done (`14b1b86`, `6d202b3`)

`drizzle/` is now committed, with `db:generate`, `db:migrate` and `db:baseline`
scripts. CI runs `db:generate` and fails if it produces a diff, so a schema
change cannot reach production without its migration.

**The "generate from a scratch database" question dissolved.** `generate`
compares `src/server/db/schema.ts` against `drizzle/meta/_journal.json`, not
against a live database. With no `drizzle/` directory the diff is therefore
create-from-zero, produced offline. No scratch database was needed to *write*
the baseline — only to *verify* it.

**Verified against real scratch databases** (`CREATE DATABASE` is permitted on
this Neon project, so this was tested rather than reasoned about):

| Scenario | Result |
| --- | --- |
| Fresh empty db, `db:migrate` alone | creates both tables, exit 0 |
| `db:push`-shaped schema, `db:baseline`, then `db:migrate` | clean no-op, exit 0 |
| Db built only from the committed migrations | introspects to the same SQL as dev |
| A migration added after the baseline | applies on top of it |
| `db:baseline` on an empty db | refuses, exit 1 |

All scratch databases were dropped afterwards; at the time of that work dev held
100 ads and 200 images, untouched apart from its own
`drizzle.__drizzle_migrations` row. The count has since grown — see the header.

**Adopting this on a database that predates it.** `db:migrate` against dev or
prod would try to `CREATE TABLE` and fail, because the schema is already there
via `db:push` and neither has a migration row. `pnpm db:baseline` records the
baseline as applied without running it — the standard adoption step. It
**refuses unless both tables are present**, because baselining an empty
database would leave `db:migrate` convinced the schema exists. That failure is
silent and much harder to diagnose than a refusal.

**Dev has been baselined. Production has not** — that needs prod credentials
and is the one open item in §3.3. It does not block anything else here: the
migration set is a verified superset of the schema dev actually has, so the
worst case is that prod needs `db:baseline` before its first `db:migrate`.

Three bugs surfaced by running it, none of which reading the code would have
caught:

- `ON CONFLICT DO NOTHING` **inserted a duplicate row on every run.** The
  migrations table has no unique constraint on `(hash, created_at)`, so
  Postgres has nothing to conflict on. Guarding on what is already recorded is
  what makes it idempotent — three runs now produce exactly one row.
- The neon HTTP tag turns **every** interpolation into a bind parameter, so a
  table name passed through it becomes `INSERT INTO $1`. Positional `$1` via
  `sql.query` is the form that works.
- `= ANY($1)` is unusable; the driver sends arrays as text and Postgres reports
  a malformed array literal.

**Known rough edge:** `drizzle-kit migrate` exits non-zero on failure but prints
nothing about what failed. Diagnosing a failed production migration means
running the SQL by hand. `db:baseline`'s own errors do explain themselves.

### 3.5 Decide on end-to-end tests (blocked on a decision, unchanged)

The plan called for Vitest **+ Playwright**. Only Vitest was set up, because
every route here is dynamic and reads Postgres — an E2E run needs a database
this repo does not provision.

To unblock, pick one:

- **(a) A Neon branch per CI run.** Neon supports database branching; create one
  in the workflow, run migrations, run E2E against it, tear it down. Most
  faithful, needs a Neon API token.
- **(b) A `postgres` service container in CI.** Simplest, but the app uses
  `@neondatabase/serverless` (HTTP driver), which will not talk to a local
  Postgres over TCP. Would need a driver swap behind an env check.
- **(c) Keep E2E local-only.** Playwright config with `webServer`, run manually
  before release, not in CI.

Then cover, in priority order: browse → region filter → load more → ad detail
→ intercepting modal → 404 for a deleted ad. Anonymous flows only.

### 3.6 `contactPhone` visibility — known product decision, not a bug

`contactPhone` is visible on the ad detail page to **any signed-in user**, not
just the owner. This predates the review work and looks intentional. If the
threat model is "contact data must not leak", that is the remaining path —
gate it on `currentUser?.userId === ad.userId` in
`src/components/AdCard/AdCardCompact.tsx`.

### 3.7 `next-auth` v5

Still on v4. Auth.js v5 is `5.0.0-beta.32` — beta after three years. Not
worth it now; the ownership model no longer depends on which version is in use.
Revisit only if v5 goes stable.

### 3.8 Deferred upgrades (explicitly out of scope, agreed)

`motion` 12→13, `eslint` 9→10, `@types/node` 20→26, `typescript` 5→7 (the Go
rewrite). One dependency per change, each with a green suite before and after.

Also `next@16.3.7` is available but was published on 2026-09-29. This
machine's `~/.npmrc` sets `min-release-age=3` (days), which pnpm surfaces as
`minimumReleaseAge: 4320` minutes — a supply-chain guard, and **not** a repo
setting, so do not go looking for it in `pnpm-workspace.yaml`. 16.3.6 is the
newest version past that window. Do not disable the guard.

### 3.9 One database, shared by dev and production — deliberate (`4dc798c`)

Found rather than designed: the app was created with a single Neon database,
Vercel's `DATABASE_URL` points at it, and `.env` is copied to the Vercel host.
So development and production are the same database, holding generated rows and
no real users.

**Decided to keep it that way.** For a portfolio project with no real users the
upside is real — production keeps showing the seeded listings, so the site
demonstrates itself instead of looking broken. **Do not "create a second
database" as a fix.** Real users appearing is the trigger to revisit this.

In practice:

- `pnpm db:seed` writes to production. Safe only because the rows are generated.
- `pnpm db:migrate` migrates production.
- The `SEED_ALLOW` guard (`src/utils/seed-guard.ts`) refuses when the variable is
  absent, which covers CI and a fresh clone. It does **not** cover production:
  `.env` travels to the Vercel host, so the variable is set there too. That limit
  is written in `.env`, the guard's header and the README rather than implied —
  the earlier version of all three claimed a guarantee a single database makes
  impossible, which was a false safety claim.

If real users ever appear: create a second database, `DATABASE_URL=<prod>
pnpm db:migrate` to build the schema (verified, no `db:baseline` needed), point
Vercel at it, and remove `SEED_ALLOW` from the Vercel environment.

---

## 4. Conventions to follow

**Ownership goes in the query.** `findAdOwnedByCurrentUser`
(`src/lib/ads.ts`) constrains the `WHERE` clause by `userId`. Never
fetch-then-compare — that reads the row before settling access.

**"Not yours" and "does not exist" return the same thing.** Otherwise responses
enumerate which ids exist.

**Never return a raw database error to the client.** It names tables, columns
and constraints. Log it *with the cause*, return a generic message. Validation
failures may explain themselves; unexpected failures may not.

**Never trust a value a Server Action receives.** Derive identity from the
session. `addImageToAd` and `getSessionUser` were both briefly `'use server'`
and had to be `server-only`.

**Allowlist, don't omit.** `toPublicAd` lists fields explicitly so a new column
does not become public by accident, and `PublicAd` makes TypeScript fail until
someone decides otherwise.

**A quota is not an authorization boundary.** When a soft limit needs
serialization, prefer failing open and logging over making an infrastructure
dependency a hard availability requirement. But if the mechanism is degraded,
say so — silently losing the guarantee is the part that is not acceptable.

### Lock conventions

- `withUserLock(userId, fn, operation?)` — `operation` is part of the Redis key,
  so two kinds of locked work for one user neither contend nor inherit the
  guarantee. Assert the default in tests; a wrong default silently disables it.
- The acquire budget must stay **below** `LOCK_TTL_MS`, and it is bounded by
  wall-clock rather than by a count of sleeps — see §2.5 for why that
  distinction is the whole ballgame. `ACQUIRE_DEADLINE_MS` is *derived* from
  `LOCK_TTL_MS`, `MAX_SET_CALL_MS` and a safety margin, so the invariant cannot
  be broken by editing one number.
- `operation` is a **required** parameter of `withUserLock`. It is part of the
  Redis key: two spellings of the same operation would stop serializing
  anything, silently. Keep it that way.
- Release is a Lua script, never `DEL`. The token comparison is what stops a
  stale holder deleting the current one's key. Check the script's return value:
  `0` means the lock was lost and two critical sections may have overlapped.

### Testing conventions

- Server-side test files start with `// @vitest-environment node`. Default
  environment is jsdom.
- Tests live in `__tests__` folders beside the code.
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even
  when the check is removed — that mistake was made and caught once already.
- Before believing a test proves something, revert the fix and confirm it
  fails. The `expect(mocks.x).toHaveBeenCalled()` shape proves nothing.
- **Check that a test can fail at all.** A test that asserts a formula about the
  wrong quantity passes no matter what. `attempts * backoff < TTL` (§2.5) held
  for the whole life of the lock while the property it named was routinely
  violated, because latency was in none of the terms. If a constant cannot
  influence the assertion, the assertion is decorative.
- **Say what a test catches, not what you hope it catches.** The test that the
  acquire deadline is *derived* passes just as well against a hardcoded literal
  holding today's value. Its comment says "drift, not hardcoding", because that
  is the truth and the stronger claim would mislead the next reader.
- **A reviewer's finding is data, not a verdict.** Two of the three rejected
  findings above were confidently asserted and wrong. Re-read the artifact
  before acting; a fresh reviewer has the same capacity to be wrong as you do.
- **A hand-written fake must not encode the property under test.** An early
  version of the Redis fake rejected a held key whether or not `nx` was set, so
  deleting `nx` still passed. Model the real primitive: without `NX`, `SET`
  overwrites and returns OK.
- **Assert contention actually happened.** With a single-threaded runtime and
  an in-process fake, "peak concurrency 1" is also what a version that never
  called Redis would produce. Pair it with an assertion that the fake turned
  callers away.

### Known-fiddly bits

- `AdGrid` and `AdPhotosGallery` need `vi.mock` for `next/navigation` and
  `../ToastProvider`; `useSearchParams` returns null outside a router.
- `RegionSelectBlock` is `display: none` by default (shown only under a media
  query that jsdom does not evaluate), so queries need `{ hidden: true }`.
- Radix `Select` will not open its portal in jsdom while the trigger is
  hidden, so the "pick a region" path is not unit tested — it wants E2E.
- `Icon` renders a real `<svg>`; `react-feather` was inlined and removed.
  `paths` in `src/components/Icon/Icon.tsx` is the icon set.
- `tsx` compiles to CJS here (`package.json` has no `"type": "module"`), so
  **top-level `await` fails** in a scratch script. Wrap in an async function.
- `Redis.fromEnv()` does **not** throw when the variables are missing; it warns
  at construction (`nodejs.mjs:274-278`) and returns a client that fails on
  every call. Importing the module proves nothing about configuration.
- **The neon HTTP tagged template binds *everything*.** Any interpolation
  becomes a `$1` parameter, so an identifier or array passed through it produces
  `INSERT INTO $1` or `malformed array literal`. Use
  `sql.query('... VALUES ($1,$2)', [a, b])` when a statement needs both a
  literal table name and bound values. Three of the bugs in §3.4 were this.
- `getTableConfig(table).columns` is an **array** of column configs on
  drizzle-orm 0.45, not a name-keyed record. `Object.keys()` over it yields
  `'0'`, `'1'`, … and a test built on that asserts nothing while looking
  correct.
- The Redis client's `signal` option is a **factory evaluated per HTTP
  request**, not per command. So `retries: N` multiplies the effective
  per-command timeout — which is why `MAX_SET_CALL_MS` in `user-lock.ts` is
  `timeout * (retries + 1)`, and why bounding the lock loop by *sleep* count
  rather than wall-clock was wrong (§2.5).

---

## 5. Useful commands

```bash
pnpm verify          # lint + typecheck + test + build — the pre-push gate
pnpm test            # 211 tests
pnpm test src/server # one directory
pnpm db:generate     # write a migration from the schema into drizzle/
pnpm db:migrate      # apply pending migrations
pnpm db:baseline     # ONE TIME, per database predating migration history
pnpm db:studio       # inspect the database
pnpm db:seed         # 100 more fake ads, on top of whatever is already there
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → **migration drift
check** → build on every push and PR to `main`. Since Next.js 16 no longer
lints inside `next build`, this workflow is the **only** automated gate in the
repo. The drift step runs `db:generate` and fails if it produces a diff, so a
schema change cannot reach production without its migration (§3.4).

---

## 6. Things deliberately not done

- **No `CONSTRAINTS.md`.** Worth adding via the `constraint-driven-development`
  skill if the quality bar should be written down rather than implied by CI.
- **No E2E** (see §3.5).
- **No React Compiler.** Stable in Next 16 but not enabled in `next.config.ts`.
- **Loading states not revisited.** Three `loading.tsx` files exist and all
  render a bare `Spinner`. `AdCardSkeleton` was deleted as dead code, so grid
  skeletons would need rebuilding from scratch.
- **The ad limit is still not a database invariant.** It is serialized in
  application code and degrades to unenforced if Redis is down. A hard guarantee
  would need a schema change — a `slot smallint` with `UNIQUE(userId, slot)` and
  retry-on-conflict, which the database can enforce without transactions. That
  was blocked on the migration system not existing; **it exists now (§3.4)**, so
  this is the natural next schema change.
- **One account, two providers, two limits.** The lock and the count both key on
  the OAuth provider account id, so a person signing in with both GitHub and
  Google has two ids and can hold 4 ads. Pre-existing, now encoded in the lock
  key rather than fixed.

### Incident worth remembering — and it happened twice

While verifying the seed script I wrote a scratch script whose cleanup step was
`db.delete(ads)` with no `where`, which deleted all 60 ads and cascaded to all
123 images. The rows were fake test data and were restored with `pnpm db:seed`,
but the lesson is procedural: **never write an unscoped `db.delete` in a file
described as temporary**, especially next to a real database. Scope by a known
test `userId` and assert the before/after counts.

**The second time, the delete *was* scoped — and it was still wrong.** Cleaning
up after a seed verification, I deleted with
`WHERE "createdAt" > (SELECT min("createdAt") ...) + interval '1 second'`, aiming
to remove only the 100 rows just inserted. It removed 199 of 200. Seeded ads are
inserted in a single statement, so **every row shares one `createdAt`** and any
timestamp-based cutoff is meaningless — the boundary is `min`, so "> min + 1s"
matches the original batch too.

Restored with `pnpm db:seed`. No real data was ever at stake, but that is the
only reason, and it is luck rather than design. The general lesson is the
stronger one:

- **Prefer no delete at all.** Seeding is additive, so restoring is just
  `pnpm db:seed` again. Reach for a `DELETE` only when a test genuinely has to
  undo a *partial* run.
- **Give seed data a marker you can select on.** A known test `userId` prefix or
  a dedicated tag column makes a scoped delete reliable. Timestamps do not.
- **Never compute a cutoff from the data you are about to filter.** The
  predicate and the data being filtered are then the same fact.

This is now also the reason `pnpm db:seed` cannot touch production by accident
(§3.9) — the data is cheap to regenerate, but a mistake against a shared
database is not cheap to reason about.
