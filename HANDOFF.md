# HANDOFF

State of the repository and what to do next, for a reader with no memory of the
work. Facts only: anything recoverable from `git log`, the code comments, or the
README is not repeated here, and neither is the history of how a bug got fixed.
If you want the history of a decision, `git log -S` finds it; if you want its
current shape, the code says so.

- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 277 tests
  across 33 files, `next build` succeeds.
- **Database:** one Neon database (`neondb`) shared by development and
  production (§3). 201 generated ads and 394 images, all seeded, no real mampokoj
  user data. Also holds 128 KB of abandoned tables from two older projects (§8).

---

## 1. Environment facts that will otherwise waste your time

1. **Upstash Redis does not resolve from this machine** (`ENOTFOUND`). Anything
   touching Redis is mocked in tests and has **never run against a live
   instance**. See §2.1.
2. **Postgres is reachable and `CREATE DATABASE` is permitted**, which is how the
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

**The next session should start at §9.3** — the app runs, but these are the gaps
between a portfolio demo and a site with real landlords on it. Everything in §2.1
to §2.3 is still open and none of it blocks; §9.1 and §9.2 are closed.

### 2.1 The Lua release script has still never been executed

`RELEASE_SCRIPT` in `src/server/user-lock.ts` is text-pinned by a test and
reviewed by eye, but never run, because Redis is unreachable (§1, item 1). Its
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

- **Run `pnpm storage:reconcile` by hand after any incident involving uploads or
  deletes, and before assuming the bucket is empty.** UploadThing bills a file
  before its row is written and removes it before the row, so a crash, an outage
  or a rate limit leaves one side pointing at nothing. Dry run by default;
  `--delete` removes orphans. Not automated and not scheduled. §3 explains why it
  stops at orphans.

- **`next-auth` is on the stable v4 line** (`4.24.14`): `NextAuthOptions`,
  `getServerSession`, `signIn`/`signOut`, `Session` from `next-auth`. v5 has been
  beta for years and changes the config shape, so treat a move to it as its own
  task with the auth surface's tests green either side — not as a version bump.
- **Deferred upgrades**, one per change with a green suite either side: `motion`
  12→13, `eslint` 9→10, `@types/node` 20→26, `typescript` 5→7.

---

## 3. Decisions that look like mistakes but are not

Each is deliberate, reasoned in the file named, and pinned by a test where a
comment would not hold.

**`upload-guard.ts` fails closed.** It awaits `ratelimit.limit()` with no
`try/catch`, so an unreachable Redis breaks uploads. A quota is not an
authorization boundary, so the ad lock fails open and logs; but here the
mechanism *is* the control, so failing open would turn an outage into an abuse
window. **Do not "fix" this toward consistency with the ad lock.**

**The ad lock is advisory, not authoritative, and no longer carries the
quota.** The limit is enforced by the slot index (§7), so when Redis is
down the critical section still runs, unserialized, and logs — and the
limit holds anyway. An outage can cost a create a lost race for a free
slot, never an over-limit account.

**Why a lock still exists when the database enforces the limit.** The count it
used to guard could not be enforced in the database — `db.transaction` throws on
the neon-http driver, `pg_advisory_xact_lock` cannot help under READ COMMITTED, a
trigger runs inside the INSERT's snapshot, and a partial unique index can only
say "at most 1" — all measured, all reasoned in `user-lock.ts`'s docstring. The
slot index (§7) is a write-time conflict on the key itself, so it reads no
snapshot and needs none of that. What remains of the lock is serialization.

**One database for dev and production.** Found, not designed: Vercel's
`DATABASE_URL` points at the dev database and `.env` is copied to the Vercel
host. Kept, because for a portfolio project with no real users production keeps
demonstrating itself. **Do not "create a second database" as a fix.** Real users
appearing is the trigger to revisit — not the Free plan, which allows 100
projects and where this database uses under 9 MB of the 1 GB per project, so
sharing is a choice here rather than a constraint. The `SEED_ALLOW` guard (`src/utils/seed-guard.ts`) covers CI and a
fresh clone but **not** production, since `.env` travels to the Vercel host; that
limit is stated in the guard's header rather than papered over. The database also
serves other projects on the account, isolated by table prefix; see §8.

**There is no `SessionProvider`.** `AuthButton` was the last caller of
`useSession()`; it takes the session as a prop from the layout, so the header is
correct in the SSR HTML instead of rendering a spinner and popping into place on
every navigation. With no consumer, the provider was deleted rather than left
wrapping the app. If you add a caller that needs `useSession()`, add the
provider back with it — `signIn`/`signOut` work without one.

**Reconciliation deletes orphans but never dangling rows.** `storage:reconcile.tsx`
reports a row whose file is missing in the bucket and then leaves it alone. That
asymmetry is the whole design: a missing file does not prove the row is
unwanted — a deleted ad's rows, an in-flight UploadThing deletion and genuine
damage are indistinguishable from outside — and deleting one destroys user data,
where keeping it costs a broken thumbnail. **Do not "complete" it by deleting
dangling rows.** The plan lives in `src/utils/storage-reconcile-plan.ts`, which
is pure and where the reasoning is asserted.

**Seeded rows are excluded from that report, and it is not a filter for taste.**
Their synthetic `seeded-<uuid>` keys never existed in the bucket, so every seeded
row is permanently "dangling" by the rule above. Measured against the live
bucket: without this rule the script reports all 394 seeded rows as damage. Since
development and production share a database, acting on that report would delete
a hundred generated listings' worth of rows. If the seed key format in
`seed-data.ts` ever changes, this prefix has to change with it.

**The header's controls share one box model because there is only one.**
`HeaderControl.tsx` owns the styling. `ControlLabel` (visible on desktop) and
`ControlNameOnly` (never visible — the theme toggle's label is a sentence) are
the same idea in two shapes, and picking the wrong one is a visible regression,
so `Header.test.tsx` asserts which each control got.

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
  the client pass. An `async` Server Component cannot hold the directive, so
  those keep their styled definitions in a sibling `*.styles.tsx` that does —
  `AdCard`, `AdCardCompact`, `MainColumn`, `app/page.tsx`,
  `app/dashboard/[userId]/page.tsx`. Do not move them back;
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
- **`client.unsafe()` is a fragment for that template, not a query executor.**
  Awaited on its own it returns the SQL it was handed, having run nothing — no
  error, no rows — so `CREATE DATABASE` and the next statement both look fine
  while the database was never created. Verbatim SQL goes through the template:
  `` client`${client.unsafe('CREATE DATABASE x')}` ``.
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
- **`server-only` is an alias Next provides, not a package that resolves on its
  own.** Next maps it in the bundler and `vitest.config.mts` maps it to a stub,
  but `tsx` resolves neither, so a `tsx` script importing any `server-only`
  module — which includes `src/server/storage.ts` and `attach-image.ts` — fails
  `MODULE_NOT_FOUND`. It is now a real dependency and `storage:reconcile` passes
  `--conditions=react-server`, which resolves the marker to its no-op build
  outside a client graph. Applies to every future `tsx` script that imports one.
- **`utapi.listFiles` is paginated, and a partial read looks like a bucket full
  of orphans.** Reconcile pages until `hasMore` is false; without that, every file
  past the first page looks unreferenced and `--delete` would remove live photos.
- **`db:migrate` can be a silent no-op, because the migration ledger is not
  prefixed.** `drizzle.__drizzle_migrations` is named by library default, so it
  is *not* covered by the `mampokoj_` table prefix, and the migrator reads
  **only the newest row** to decide what is pending. A newer row written by
  another drizzle project on this same database makes this repo's `db:migrate`
  apply nothing, print nothing and exit 0. Nothing on this database does that
  today (§8), but it is the symptom to recognise the day one starts.
- **Excess-property checking does not reach through `flatMap` inference.** A seed
  builder set a column that does not exist and `tsc` was silent; the insert
  succeeded anyway. That is why the seed tests compare against
  `getTableColumns` and derive the required set from `hasDefault`.
- **`Modal` is one box split across two files.** `Content` and `AdCardCompact`'s
  `Wrapper` share it through a `data-modal-box` attribute — set in `Modal.tsx`,
  selected in `AdCardCompact.styles.tsx`. Rename it in one file without the other
  and the dialog draws a card within a card.
- **This machine's `~/.npmrc` sets `min-release-age=3` days**, which pnpm
  surfaces as `minimumReleaseAge: 4320` minutes. A **machine** supply-chain guard,
  not a repo setting — do not go looking for it in `pnpm-workspace.yaml`, and do
  not disable it. The effect is that `next` lags npm by up to three days, so a
  version being installable is not evidence it is the newest. Check
  `npm view next time` rather than assuming the pinned version is current.

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

**The shared database is baselined** — `0000_init` and `0001_breezy_warstar` are
recorded in `drizzle.__drizzle_migrations`, so `db:migrate` runs normally and
there is no `db:baseline` step in any release.

That ledger is unprefixed and therefore shared with any future drizzle project
on this database; a newer row elsewhere would make `db:migrate` skip everything
silently. Nothing does today — see §8.

For a database that predates the migration files, `db:migrate` would try to
`CREATE TABLE` and fail; `db:baseline` records the baseline without running it,
and refuses unless both tables are already present, since baselining an empty
database would leave `db:migrate` convinced the schema exists.

---

## 7. The ad limit is a database invariant

`ads` carries a `slot smallint` with a unique index on `(userId, slot)`.
`createAd` walks the slots from 0 and inserts into the first one nobody holds,
reading the 23505 off `error.cause` (§4) and treating it as "this slot is taken"
rather than as a failure. A user at the limit holds every slot, so every attempt
conflicts and the cap is Postgres refusing a duplicate pair — with no transaction
and no Redis, which is what neither of those could ever provide (§3).

Invariants a change here must preserve, each asserted somewhere:

- The unique pair must stay **unique and over exactly `(userId, slot)`**.
  `migrations.test.ts` asserts it in the schema and in the migration SQL, because
  a non-unique or narrower index puts the limit back on a count.
- A 23505 on this insert means "slot taken". The `ads` table's only other unique
  constraint is the random primary key. If a second unique index is ever added,
  discriminate on `error.cause.constraint` rather than the code alone.
- `slot` is **not public**. It is listed in `PublicAd`'s `Omit` and asserted by
  `ad-dto.test.ts`; a new column arrives there through `InferSelectModel` and
  breaks `tsc` until someone decides otherwise (`ad-dto.ts`'s fail-closed design).
- Re-seeding is safe because `seed-data.ts` gives every ad a fresh `userId`, so
  each seeded row takes `slot = 0` with nothing to collide against.

`withUserLock` still wraps `createAd` to serialize it — two creates for one user
cannot race for the same free slot. It is now redundant for the limit itself;
whether to retire it is an open decision in §9.2.

Known limitation: the slot keys on the OAuth provider account id, so a person
signing in with both GitHub and Google has two ids and can hold 4 ads
(§9.5). Pre-existing, not introduced here.

---

## 8. This database holds leftovers from two abandoned projects

`neondb` is shared across several of this owner's projects by choice, and the
`mampokoj_` table prefix keeps them apart. Four tables in `public` are **not**
this repo's, and one schema is empty:

| object | rows | what it is |
|---|---|---|
| `mampokoj_ads` | 201 | this repo, all seeded |
| `mampokoj_images` | 394 | this repo, all seeded |
| `users`, `customers`, `invoices`, `revenue` | 1 / 6 / 11 / 12 | a tutorial project, **abandoned** |
| `roomFinder` (schema) | empty | an older project, **abandoned** |

They are residue, not live neighbours. They carry no foreign keys to each other
or to anything else, so dropping them would break no constraint — but there is
also no reason to, at 128 KB total against a 1 GB per-project Free allowance.
**Do not write a migration that drops them.** They are not this repo's to delete,
§5's rule against an unscoped `db.delete` applies with extra force, and a
migration is permanent while a manual `DROP TABLE` is one command you can see
first.

### Isolation, and the one gap in it

Isolation is **by table prefix**, and it holds. `pgTableCreator` in `schema.ts`
renames every table to `mampokoj_*`, and `drizzle.config.tsx` sets
`tablesFilter: ['mampokoj_*']` to match. The filter is applied when drizzle-kit
introspects the live database, so unprefixed tables are never read and cannot
appear in a diff.

**`pnpm db:push` is therefore safe here.** The filter stops it well before the
unprefixed tables.

The prefix does **not** cover one thing: `drizzle.__drizzle_migrations` is a
single unprefixed table, named by library default (`migrationsTable ??
"__drizzle_migrations"`, `migrationsSchema ?? "drizzle"` in
`drizzle-orm/neon-http/migrator.cjs`), and the migrator decides what to run from
**only the newest row** (`order by created_at desc limit 1`). A newer row written
by any other drizzle project on this database would make `db:migrate` skip
everything here — silently, no error, no tables created.

**That cannot happen today:** measured today, the whole database has exactly one
migration table and it holds this repo's two rows, `0000_init` and
`0001_breezy_warstar` — the abandoned projects never ran drizzle's migrator. The
gap becomes real only if a *new* project starts using drizzle against this same
database, which is the moment to set `migrationsSchema: 'mampokoj_drizzle'` in
`drizzle.config.tsx` **and** the matching `MIGRATIONS_SCHEMA` in
`src/utils/baseline.tsx`, before its first migration.

---

## 9. Taking real users: what stands between this and a live site

The app runs, and the authorization core is genuinely solid — ownership is
settled in the query predicate rather than after the read, and the public payload
is allowlisted twice. That part needs no work.

What follows is what changes when the users are real landlords rather than
seeded rows. Ordered by how much damage each one does, not by effort.

### 9.1 Resolved by decision: any signed-in visitor may see a listing's phone

`getValidatedAd` selects the whole row, and both cards render the
number for any signed-in visitor, blurred until clicked. That is the
intended product rule — the gate is "signed in", not "is the poster"
— so this is not a hole. What remains true, and is documented in
`BlurredPhone`'s tests rather than fixed: the blur is a courtesy
against shoulder-surfing, not a security boundary, because the digits
are in the HTML for every signed-in visitor.

### 9.2 Resolved: the ad limit is a database invariant

Closed by the slot index (§7). An outage, or anyone who can make Redis
unreachable, can no longer mean unlimited ads per account: the limit is Postgres
refusing a duplicate pair, not application code counting and hoping.

There is still no *rate* limit on `createAd` — and there does not need to be. A
hard cap of two ads per account already refuses the third create regardless of
how fast it arrives, so a rate limit would throttle nothing a spammer cares
about. `checkUploadAdmission`'s ratelimit stays, because there the abuse is
bandwidth rather than row count.

**One decision is left, and it is yours, not an oversight.** `withUserLock` now
buys only serialization (§7). Retiring it — deleting `user-lock.ts`,
`user-lock.test.ts` and `redis-client-contract.test.ts`, and closing §2.1 and
§9.4 with it — would take Redis out of the create path completely. It was left
in place here because it deletes a deliberately engineered module whose Lua
release script has an open verification item of its own (§2.1), and that is not
a decision to make silently inside a schema change.

### 9.3 Then: no moderation, no reporting, no admin

Anyone can post any phone number. When a scam ad goes up there is no flag to click
and no query to answer "what do we take down" — the remedy is a hand-written
`DELETE`.

A site this size does not need an admin UI. A `reportedAt` column, a report
button on the public card, and one query covers it.

### 9.4 Then: Redis has never run against a live instance

`ENOTFOUND` from this machine (§1, item 1). Every rate-limit and lock path is
mocked; `RELEASE_SCRIPT` has never executed (§2.1). What is **unverified in
production** is now the smaller surface: the upload rate limit and the ad-create
serialization. That is a weaker claim than "well tested against a fake", but it
is no longer the primary abuse defence — the ad limit is the slot index, which
the migration exercised against real rows.

A working `UPSTASH_REDIS_REST_URL`, or a local Redis behind an HTTP shim, closes
this. Half a day.

### 9.5 Worth doing, not blocking

- **Two providers means two identities.** GitHub *and* Google gives two ids, so
  four ads instead of two (`user-lock.ts:151-155`, and the same `userId` the slot
  keys on). A real user hits this by accident. Needs account linking, or one
  provider.
- **No account deletion.** Name, OAuth id and phone are stored with no erasure
  path. `deleteAdById` covers one ad, not the account.
- **No email contact channel**, which is also the only route to verifying that a
  poster controls the number they published.

### 9.6 Not on this list, deliberately

- **An admin UI** — see 9.3; the column and the query are the actual requirement.
- **The dev/prod database split** — §3 explains why it is a deliberate choice, and
  §8 covers the sharing. Real users appearing *is* the trigger to revisit, so it
  belongs on this list in spirit, but it is a database-provisioning task rather
  than an application change.