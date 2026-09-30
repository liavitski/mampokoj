# HANDOFF

State of the repository and what to do next, for a reader with no memory of the
work. Facts only: anything recoverable from `git log`, the code comments, or the
README is not repeated here, and neither is the history of how a bug got fixed.
If you want the history of a decision, `git log -S` finds it; if you want its
current shape, the code says so.

- **Branch:** `main`
- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 235 tests
  across 27 files, `next build` succeeds.
- **Database:** one Neon database shared by development and production (§3).
  ~200 generated ads, no real user data.
- **Uncommitted:** the frontend work described in §4 is on disk but not
  committed.

---

## 1. Environment facts that will otherwise waste your time

1. **Use `pnpm` 11.1.3.** The global `pnpm` here is 9.0.0 and fails with
   `ERR_PNPM_UNEXPECTED_STORE`. Run `corepack enable`, or `npx pnpm@11.1.3 <cmd>`.
2. **`pnpm-workspace.yaml` is not a workspace file** — it exists only to hold
   `allowBuilds`. Do not add a `packages:` key; this is a single-package repo.
   `sharp` is intentionally not built (Vercel supplies it for `next/image`).
3. **Upstash Redis does not resolve from this machine** (`ENOTFOUND`). Anything
   touching Redis is mocked in tests and has **never run against a live
   instance**. See §2.1.
4. **Postgres is reachable and `CREATE DATABASE` is permitted**, which is how the
   migration work was verified rather than assumed. Two consequences:
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

Nothing is blocking. The ad-limit invariant in §7 is the natural next *schema*
change, now that migrations exist.

### 2.1 The Lua release script has still never been executed

`RELEASE_SCRIPT` in `src/server/user-lock.ts` is text-pinned by a test and
reviewed by eye, but never run, because Redis is unreachable (§1, item 3). Its
assumptions were about the `@upstash/redis` *client*, which can be exercised
without a server since the library calls the bare global `fetch`;
`src/server/__tests__/redis-client-contract.test.ts` does that and pins the wire
format both ways.

**Executing the Lua needs a real Redis, not a cleverer fake.** `luajit` is
installed locally, so the script could run against a hand-written `redis.call`
stub — but that stub would encode the very token comparison under test and pass
whatever the script said. A working `UPSTASH_REDIS_REST_URL`, or a local Redis
over HTTP, is the only honest way to close this.

### 2.2 Decide on end-to-end tests (blocked on your decision)

Every route is dynamic and reads Postgres, so an E2E run needs a database this
repo does not provision. Pick one:

- **(a) A Neon branch per CI run.** Most faithful; needs a Neon API token.
- **(b) A `postgres` service container.** Simplest, but the app's
  `@neondatabase/serverless` HTTP driver will not talk to a local Postgres over
  TCP; needs a driver swap behind an env check.
- **(c) Local-only.** Playwright `webServer`, run by hand before release.

Then cover, in priority order: browse → region filter → load more → ad detail →
intercepting modal → 404 for a deleted ad. Anonymous flows only.

### 2.3 Smaller items

- **Six contrast failures in the palette, measured, not fixed.** Computed from
  the tokens as they stand. `src/__tests__/contrast.test.ts` asserts a floor
  only over the pairs that currently pass. Do not "fix" one in isolation.

  | pair | needs | light | dark |
  |---|---|---|---|
  | `--color-primary-foreground` on `--color-primary` | 4.5 | **4.48** | 5.77 |
  | `--color-link` on `--color-background` | 4.5 | **3.86** | 6.79 |
  | `--color-destructive-foreground` on `--color-destructive` | 4.5 | **3.76** | **3.76** |
  | `--color-destructive-foreground` on `--color-destructive-hover` | 4.5 | **3.58** | **3.58** |
  | `--color-destructive` on `--color-card-background` | 4.5 | **3.44** | **3.89** |
  | `--color-success` on `--color-card-background` | 3.0 | **2.08** | 8.41 |

  The **input boundary fails in both themes, as one problem**:
  `--color-border-input` on `--color-input-background` is **1.49** light and
  **1.22** dark, where 3:1 is required. The border is what delineates a field, so
  no fill that still looks like an input can substitute for fixing it — which is
  why the token test asserts 1.2, pinning "a field is not the page colour"
  rather than a threshold it cannot reach. Raising `--color-border-input` in
  both themes is the actual fix.

- **`Modal`'s content box is wrong, deliberately not fixed.** `Modal.tsx` sets
  `position: fixed; inset: 0` with `align-self`/`justify-self: center`, which do
  nothing because the element is not a flex container. The dialog is a
  full-viewport *transparent* box, so its `border-radius` and `max-height` apply
  to nothing visible. `AdCardCompact` centres itself in it and reads correctly;
  the overlay itself is still a screen-sized element with no background. Fixing
  it means making `Content` a real centring flex container and constraining
  `ScrollArea`, which changes how every dialog positions its content — its own
  pass, not a drive-by.

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
`try/catch`, so an unreachable Redis breaks uploads. A quota is not an
authorization boundary, so the ad lock fails open and logs; but here the
mechanism *is* the control, so failing open would turn an outage into an abuse
window. **Do not "fix" this toward consistency with the ad lock.**

**The ad lock is advisory, not authoritative.** If Redis is down the critical
section still runs, unserialized, and logs. A soft quota should not become a hard
availability dependency.

**The database cannot enforce the ad limit, and that was measured.** Do not
re-derive it: `db.transaction` throws on the neon-http driver; a single-statement
`pg_advisory_xact_lock` does not help, because under READ COMMITTED a blocked
caller proceeds with a snapshot from *before* the winner committed and its
`count(*)` cannot see the new row (eight concurrent inserts breached a limit of
two in five rounds of six). A **trigger has the same defect**, running inside the
INSERT's snapshot. A partial unique index can only express "at most 1". Hence
mutual exclusion outside the database, hence Redis.

**One database for dev and production.** Found, not designed: Vercel's
`DATABASE_URL` points at the dev database and `.env` is copied to the Vercel
host. Kept, because for a portfolio project with no real users production keeps
demonstrating itself. **Do not "create a second database" as a fix.** Real users
appearing is the trigger to revisit. The `SEED_ALLOW` guard
(`src/utils/seed-guard.ts`) covers CI and a fresh clone but **not** production,
since `.env` travels to the Vercel host; that limit is stated in the guard's
header rather than papered over.

**There is no `SessionProvider`.** `AuthButton` was the last caller of
`useSession()`; it takes the session as a prop from the layout, so the header is
correct in the SSR HTML instead of rendering a spinner and popping into place on
every navigation. With no consumer, the provider was deleted rather than left
wrapping the app. If you add a caller that needs `useSession()`, add the
provider back with it — `signIn`/`signOut` work without one.

**The header's controls share one box model because there is only one.**
`HeaderControl.tsx` exports `ControlLink`/`ControlButton` plus four label/icon
wrappers; `ControlLabel` (visible on desktop) and `ControlNameOnly` (never
visible, for the theme toggle, whose label is a sentence) are the same idea in
two shapes, and picking the wrong one is a visible regression, so
`Header.test.tsx` asserts which each control got.

**Not done, on purpose:** no E2E (§2.2), no React Compiler (stable in Next 16,
not enabled), loading states not revisited (three `loading.tsx` files render a
bare `Spinner`), no `CONSTRAINTS.md` (the `constraint-driven-development` skill
would add one).

---

## 4. Traps

Each of these cost real time.

- **Any module calling `styled.*` or `createGlobalStyle` needs `'use client'`.**
  A styled component in a Server Component generates its rule during the RSC
  pass, where it lands in the flight payload and is never emitted — and nothing
  recovers it, because a Server Component does not re-render on the client.
  `StyledComponentsRegistry` does not help; its `StyleSheetManager` only wraps
  the client pass. This shipped as three unrelated-looking bugs at once (logo
  unstyled, header not a flex row, page never width-constrained) and none of
  them threw, logged, or failed the build. An `async` Server Component cannot
  hold the directive, so those keep their styled definitions in a sibling
  `*.styles.tsx` that does — `AdCard`, `AdCardCompact`, `MainColumn`,
  `app/page.tsx`, `app/dashboard/[userId]/page.tsx`. Do not move them back;
  `src/__tests__/styled-components-boundary.test.ts` fails if you do.
  **To check by hand:** `curl` a route, collect the class names from the body,
  and confirm each appears in a `<style>` element or a linked stylesheet. A class
  appearing only inside a `<script>` is dead CSS.
- **Global rules are in `src/app/globals.css`** — same failure one level up; a
  stylesheet linked from `<head>` cannot regress it and needs no boundary.
- **A custom property that resolves to nothing is silent.** For an inherited
  property the declaration is simply invalid at computed-value time and the
  element keeps its parent's value. `src/__tests__/tokens.test.ts` fails on this.
- **The neon HTTP tagged template binds *everything*.** Any interpolation becomes
  a `$1` parameter, so an identifier or array passed through it yields
  `INSERT INTO $1` or `malformed array literal`. Use
  `sql.query('... VALUES ($1,$2)', [a, b])` when a statement needs both a
  literal table name and bound values.
- **A unique violation does not arrive where you look.** Drizzle wraps driver
  errors, so 23505 reaches you as a `DrizzleQueryError` with `code: undefined`;
  the real `NeonDbError` is on **`.cause`**. Retry logic must read
  `error.cause.code`.
- **`Redis.fromEnv()` does not throw when the variables are missing** — it warns
  at construction and returns a client that fails on every call. Importing the
  module proves nothing about configuration. Set the variables in `vi.hoisted`,
  before the import runs.
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
  what failed.** Diagnosing it means running the SQL by hand.
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
because its violation shipped; `git log` has the story.

- **Revert the fix and confirm it fails before believing a test proves
  something.** `expect(mocks.x).toHaveBeenCalled()` proves nothing.
- **Assert on what the code under test produced, not on what the test produced.**
- **If a constant cannot influence the assertion, the assertion is decorative.**
- **A hand-written fake must not model the property under test.** Model the real
  primitive: without `NX`, `SET` overwrites and returns OK.
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even
  when the check is removed.
- **Assert contention actually happened.** With a single-threaded runtime and an
  in-process fake, "peak concurrency 1" is also what a version that never called
  Redis would produce.
- **Restore a spy only after asserting on it.** `mockRestore()` also resets
  `mock.calls`, so restoring in a `finally` and asserting afterwards reads an
  empty list.
- **Say what a test catches, not what you hope it catches.**
- **A reviewer's finding is data, not a verdict.** Several confidently asserted
  findings in this repo's history were wrong. Re-read the artifact before acting.
- **Never write an unscoped `db.delete`** in a file described as temporary,
  especially next to a real database. Prefer no delete at all: seeding is
  additive, so restoring is `pnpm db:seed` again. If a delete is unavoidable,
  scope it by a known test marker — **never by a timestamp**, because a seeded
  batch shares one `createdAt` and any cutoff computed from the data is the same
  fact as the data.

Server-side test files start with `// @vitest-environment node` (the default is
jsdom). Tests live in `__tests__` folders beside the code.

**jsdom does not evaluate `@media`, so a responsive CSS bug is invisible to a
component test.** `Header.test.tsx` asserts both halves for that reason: a
`getByRole(name)` check, which proves a control is named *as rendered*, and a
`document.styleSheets` check, which proves the name survives the phone
breakpoint. `display: none` instead of `clip-path` fails only the second.

---

## 6. Migrations

`drizzle/` is committed, with `db:generate`, `db:migrate` and `db:baseline`. CI
runs `db:generate` and fails if it produces a diff, so a schema change cannot
reach production without its migration.

`generate` compares `src/server/db/schema.ts` against
`drizzle/meta/_journal.json`, not against a live database, so a create-from-zero
baseline falls out of an empty `drizzle/` offline. No scratch database is needed
to *write* a migration, only to verify one.

**Dev is baselined. Production is not**, and cannot be until it has its own
credentials — nothing is blocked on it, since the migration set is a verified
superset of the schema dev actually has, so the worst case is that production
needs `pnpm db:baseline` before its first `db:migrate`. On a database that
predates the migration files, `db:migrate` would try to `CREATE TABLE` and fail;
`db:baseline` records the baseline without running it, and refuses unless both
tables are already present, since baselining an empty database would leave
`db:migrate` convinced the schema exists.

---

## 7. The next schema change, when you take it

The ad limit is not a database invariant — it is serialized in application code
and degrades to unenforced if Redis is down. A hard guarantee is a `slot smallint`
with `UNIQUE(userId, slot)` and retry-on-conflict, which Postgres can enforce
without transactions.

Two things measured against the live database, so they need not be rediscovered:

- **Read the error code off `.cause`** — see §4.
- **The backfill is unobstructed.** 201 ads across 201 distinct users, so no user
  holds more than one, every row can take `slot = 0`, and nothing in the existing
  data blocks the index.

Known related limitation: the lock and the count both key on the OAuth provider
account id, so a person signing in with both GitHub and Google has two ids and
can hold 4 ads. Pre-existing, now encoded in the lock key rather than fixed.