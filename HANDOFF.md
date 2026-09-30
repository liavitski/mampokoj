# HANDOFF

State of the repository and what to do next. Written to be read cold, with no
memory of the work that produced it.

- **Branch:** `security/harden-server-actions` (13 commits ahead of `main`, unpushed)
- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 185 tests
  across 19 files, `next build` succeeds
- **Stack:** Next.js 16.3.6, React 19.3, pnpm 11.1.3, TypeScript 5, Drizzle +
  Neon Postgres, NextAuth v4, UploadThing, Upstash, styled-components v6, Vitest
- **Dev database:** 100 fake ads / 200 images from `pnpm db:seed`. All test
  rows, no real user data.

---

## 1. Read this first

Three environment facts that will otherwise waste your time:

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

---

## 2. What was just done

Thirteen commits. The first eleven were a review-and-harden pass over a
codebase with zero tests and zero CI; the most recent two are in §2.1 and §2.2.

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
| `ff3d0e1` | Seed script made runnable and covered |
| `8942bbb` | Ad creation serialized behind a per-user Redis lock |

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

---

## 3. Next steps, in recommended order

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

### 3.2 `upload-guard.ts` has no error handling around Redis

`checkUploadAdmission` awaits `ratelimit.limit()` with no `try/catch`
(`src/server/upload-guard.ts:30`). If Redis is unreachable this throws out of
the UploadThing middleware, so uploads break entirely. That is arguably
correct for an upload guard — do not store files you cannot rate-limit — but it
is inconsistent with the deliberate fail-open choice in the ad lock, and it is
now a second hard Redis dependency. Worth deciding explicitly.

### 3.3 Add tracked migrations (agreed, not started)

There is no `drizzle/` directory and no migration files in git — `git ls-files`
shows only `drizzle.config.tsx`. Schema reaches the database through
`pnpm db:push` by hand, so **schema is not applied in CI or on Vercel** and dev
and prod can silently diverge.

Plan: `drizzle-kit generate` into a committed `drizzle/` folder plus a
`db:migrate` step, replacing `db:push` as the workflow.

Two open questions, both for the user:

- **The dev database has no migration history**, so generating against it
  yields an empty diff. Cleaner to generate from a scratch database for the
  full create-from-zero set.
- **Production has presumably been receiving `db:push`.** Confirm dev and prod
  currently match before generating anything that assumes they do.

### 3.4 Decide on end-to-end tests (blocked on a decision)

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

### 3.5 `contactPhone` visibility — known product decision, not a bug

`contactPhone` is visible on the ad detail page to **any signed-in user**, not
just the owner. This predates the review work and looks intentional. If the
threat model is "contact data must not leak", that is the remaining path —
gate it on `currentUser?.userId === ad.userId` in
`src/components/AdCard/AdCardCompact.tsx`.

### 3.6 `next-auth` v5

Still on v4. Auth.js v5 is `5.0.0-beta.32` — beta after three years. Not
worth it now; the ownership model no longer depends on which version is in use.
Revisit only if v5 goes stable.

### 3.7 Deferred upgrades (explicitly out of scope, agreed)

`motion` 12→13, `eslint` 9→10, `@types/node` 20→26, `typescript` 5→7 (the Go
rewrite). One dependency per change, each with a green suite before and after.

Also `next@16.3.7` is available but was published on 2026-09-29. This
machine's `~/.npmrc` sets `min-release-age=3` (days), which pnpm surfaces as
`minimumReleaseAge: 4320` minutes — a supply-chain guard, and **not** a repo
setting, so do not go looking for it in `pnpm-workspace.yaml`. 16.3.6 is the
newest version past that window. Do not disable the guard.

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
- The acquire budget must stay **below** `LOCK_TTL_MS`. A waiter that outlives
  the lock it waits for can acquire one that expired and was re-taken, believing
  it is exclusive. There is a test for this invariant; do not just tune the
  numbers.
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
  and returns a client that fails on every call. Importing the module proves
  nothing about configuration.

---

## 5. Useful commands

```bash
pnpm verify          # lint + typecheck + test + build — the pre-push gate
pnpm test            # 185 tests
pnpm test src/server # one directory
pnpm db:studio       # inspect the database
pnpm db:seed         # 100 fake ads + ~200 images
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every
push and PR to `main`. Since Next.js 16 no longer lints inside `next build`,
this workflow is the **only** automated gate in the repo.

---

## 6. Things deliberately not done

- **No `CONSTRAINTS.md`.** Worth adding via the `constraint-driven-development`
  skill if the quality bar should be written down rather than implied by CI.
- **No E2E** (see §3.4).
- **No React Compiler.** Stable in Next 16 but not enabled in `next.config.ts`.
- **Loading states not revisited.** Three `loading.tsx` files exist and all
  render a bare `Spinner`. `AdCardSkeleton` was deleted as dead code, so grid
  skeletons would need rebuilding from scratch.
- **The ad limit is still not a database invariant.** It is serialized in
  application code and degrades to unenforced if Redis is down. A hard guarantee
  would need a schema change — a `slot smallint` with `UNIQUE(userId, slot)` and
  retry-on-conflict, which the database can enforce without transactions. Not
  chosen because it needs the migration system that does not exist yet (§3.3).
- **One account, two providers, two limits.** The lock and the count both key on
  the OAuth provider account id, so a person signing in with both GitHub and
  Google has two ids and can hold 4 ads. Pre-existing, now encoded in the lock
  key rather than fixed.

### Incident worth remembering

While verifying the seed script I wrote a scratch script whose cleanup step was
`db.delete(ads)` with no `where`, which deleted all 60 ads and cascaded to all
123 images. The rows were fake test data and were restored with `pnpm db:seed`,
but the lesson is procedural: **never write an unscoped `db.delete` in a file
described as temporary**, especially next to a real database. Scope by a known
test `userId` and assert the before/after counts.
