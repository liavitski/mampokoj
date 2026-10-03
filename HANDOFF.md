# HANDOFF

State of the repository and what to do next, for a reader with no memory of the
work. Facts only: anything recoverable from `git log`, the code comments, or the
README is not repeated here, and neither is the history of how a bug got fixed.
If you want the history of a decision, `git log -S` finds it; if you want its
current shape, the code says so.

- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 419 tests
  across 48 files, `next build` succeeds. `pnpm test:e2e` adds 24 Playwright
  specs (§2.1), run by hand and not wired into CI.
- **Database:** one Neon database (`neondb`) shared by development and
  production (§3). 200 generated ads and 393 images, all seeded. Also holds
  128 KB of abandoned tables from two older projects (§8). The owner holds 0 of
  their 2 ad slots, and the UploadThing bucket is empty and agrees with the
  database — though the seeded **photo URLs** point at files that are gone (§2.2).
- **Production is live** at `mampokoj.vercel.app`, and the moderation queue works
  there (§9.3). Env vars are set in the Vercel dashboard by hand — see §1, which
  is the item most likely to waste an afternoon.

---

## 1. Environment facts that will otherwise waste your time

1. **Upstash Redis resolves from this machine and responds** (`PING` → `PONG`),
   as of 2026-10-03. This is the opposite of what earlier sessions recorded
   (`ENOTFOUND`), and it is what makes uploads work. It has one remaining
   consumer, `ratelimit.ts`. **Do not assume it from a test** — the suite mocks
   Redis, and a mocked Redis proves nothing about a live one. If something
   Redis-backed looks broken, ping it first; the failure mode is silent rather
   than loud.
2. **`MODERATORS` lists OAuth account ids, not email addresses.** It is the
   comma-separated allowlist for the moderation queue (§9.3) and is read by
   `src/lib/moderator-guard.ts`. The value is the same id `ads.userId` holds and
   the same one in the `/dashboard/<userId>` URL; there is no email anywhere in
   the system. **An email here never matches, and the allowlist fails closed**,
   so the symptom is `/moderation` refusing forever with nothing in the logs to
   explain it — the single most confusing failure this app has.

   **It must be set in Vercel by hand, per environment.** An earlier version of
   this file claimed `.env` travels to the Vercel host; **that was false and
   self-contradictory**, since `.env` is gitignored and so cannot travel with a
   push. Production ran for days with `MODERATORS` unset, which is why
   `/moderation` refused every signed-in moderator until it was added in the
   dashboard. Three things to know:

   - **Set it per environment.** Vercel scopes env vars, so a Production-only
     value leaves Preview deployments refusing in exactly the same silent way.
   - **The value is the account id, never an email.** Read it off your own
     `/dashboard/<userId>` URL rather than looking for it here — it is
     deliberately not written down in this repo, which is public.
   - **No redeploy was needed** when it was fixed (2026-10-03): Vercel applied
     the new value to the running deployment. Do not assume that is true for
     every variable, though — build-time variables do need a redeploy.

   The allowlist is not a secret. It gates the *web* surface only, and anyone
   who can run a script with the repo's `.env` is already fully privileged.
3. **Postgres is reachable and `CREATE DATABASE` is permitted**, which is how the
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

**The next session should start at §9.4.** The app runs, §9.1–§9.3 are closed,
and the two items that needed a decision (§2.1's E2E question, §9.2's
`withUserLock` retirement) have both been taken. Nothing left is blocking: three
items in §9.4 and two in §2.2, none of which gate anything.

### 2.1 End-to-end tests: local-only, by hand

`@playwright/test` is installed and **`pnpm test:e2e` runs 24 specs**, covering
browse → region filter → load more → ad detail → intercepting modal →
not-found. Config is `playwright.config.ts`; specs are in `e2e/`.

There is no CI wiring and no database provisioning. `webServer` reuses whatever
`pnpm dev` is already running, or starts one, and the suite runs against whatever
`DATABASE_URL` points at. `E2E_BASE_URL=http://localhost:3100` points it at a
production build instead — **do that before a release, not only against dev**,
because streaming behaves differently and the suite was green on both. Verified
green 4 consecutive runs against a build and 3 against dev, no skips.

**Every spec is an anonymous read.** That is a constraint, not a convenience: it
is why they are safe against the shared development database, and it is also why
there is no E2E coverage of the ad limit, the report predicate or the moderation
takedown. Those need a signed-in session and a disposable database.

The two rejected alternatives, for whoever reopens this: a **Neon branch per run**
needs an API token as a CI secret plus branch create/drop and teardown-on-failure;
a **local `postgres` container** needs a driver swap, because
`@neondatabase/serverless`'s HTTP driver will not talk to local Postgres over TCP —
a change to the read and write path in order to test the read and write path.

Three things this suite found that unit tests could not:

1. **A streamed page holds two copies of itself.** Next emits the resolved content
   into a bare `<div>` on `document.body` alongside the real page inside
   `MaxWidthWrapper`, and an inline script moves it into place a moment later.
   Measured during first paint: `MaxWidthWrapper` with 1 `<main>` and 10 ad links,
   and a sibling bare `div` with the same 10. A locator read as soon as `goto`
   resolves therefore sees 20 cards on a page that renders 10 — in development *and*
   in a production build. This produced a dozen confident-looking failures against
   a correct app. `e2e/support/app-shell.ts` scopes every query to the layout shell
   for this reason, and `gridReady` waits for a card inside it, because the shell
   exists from the first flush of the stream. **Anything else that reads this DOM
   early — a scraper, a monitoring probe, another test suite — has the same problem.**

2. **`notFound()` in a streamed route answers HTTP 200, not 404.** `/ad/[adId]`
   sits behind `loading.tsx`, so the response head is committed before
   `getValidatedAd` has run; `notFound()` can only swap the body. Confirmed with
   `curl` against a production build for both a missing uuid and a malformed one —
   both 200, with `NEXT_HTTP_ERROR_FALLBACK` in the payload. §9.4.

3. **An anonymous visitor's detail page has no `tel:` link at all** — it renders
   "Log in to see the contact". `BlurredPhone`, the button that reveals the number
   behind a blur, is the *signed-in* affordance. Worth knowing before writing a
   check against this page.

### 2.2 Smaller items

- **Every seeded ad photo is already dead.** Found 2026-10-03 by the E2E suite: all
  ten cards on the first page request their image through `next/image`, and every
  one of those requests 404s. `seed-data.ts` hardcodes **11 `ufs.sh` URLs** into
  `images.url`, and none of those files exist any more.

  **The part that matters: two columns of the same row disagree.** `fileKey` is
  deliberately synthetic (`seeded-<uuid>`), because a real key would collide on the
  unique index, and `storage:reconcile` keys off `fileKey`. So reconcile reports
  **no drift** while every card renders a broken image. The reconciler is not
  wrong — it answers "does the bucket hold every file we reference", and this row
  says no — but nothing in the repo checks `url`, so a dead URL is invisible to
  every tool we have. Either point the seed at files that exist or accept a broken
  thumbnail on every seeded ad; deciding is the open part.

  This is also why `e2e/browse.spec.ts` filters `Failed to load resource` out of
  its console-error assertion. Without that note the filter would look like the
  test being weakened to pass.

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
authorization boundary, so failing open here would turn an outage into an abuse
window; the mechanism *is* the control. **Do not "fix" this toward failing open.**
It is the only Redis dependency left in a write path (§9.2).

**One database for dev and production.** Found, not designed: Vercel's
`DATABASE_URL` points at the dev database and `.env` is copied to the Vercel
host. Kept, because for a portfolio project with no real users production keeps
demonstrating itself. **Do not "create a second database" as a fix.** Real users
appearing is the trigger to revisit — not the Free plan, which allows 100
projects and where this database uses under 9 MB of the 1 GB per project, so
sharing is a choice here rather than a constraint. The `SEED_ALLOW` guard (`src/utils/seed-guard.ts`) covers CI and a
fresh clone but **not** production, since env vars are set in the Vercel
dashboard by hand (§1) and `SEED_ALLOW` should be assumed present there; that
limit is stated in the guard's header rather than papered over. The database also
serves other projects on the account, isolated by table prefix; see §8.

**There is no `SessionProvider`.** `AuthButton` was the last caller of
`useSession()`; it takes the session as a prop from the layout, so the header is
correct in the SSR HTML instead of rendering a spinner and popping into place on
every navigation. With no consumer, the provider was deleted rather than left
wrapping the app. If you add a caller that needs `useSession()`, add the
provider back with it — `signIn`/`signOut` work without one.

**The moderator allowlist fails closed.** Unset, empty or malformed means nobody
moderates. The failure mode of an open allowlist is a takedown button anyone can
press, so this is the opposite trade from `upload-guard.ts` above and
deliberate. **Do not "fix" it to default-open.** The list is set in the Vercel
dashboard by hand and is readable in the deployed environment; it gates the *web*
surface and is not a secret, because anyone who can run a script with the repo's
`.env` is already fully privileged.

**This is now the second time a silent refusal cost real time**, which is why
§1 spells out the per-environment dashboard setup. The first cost an afternoon of
"why does `/moderation` refuse"; the second is why the smoke check below exists.

**`getReportedAds` selects `contactPhone` and `userId`, which every other public
query withholds.** A scam is recognised by the number, and taking an ad down
means knowing whose ad it is. Reusing `publicAdColumns` would have produced a
queue nobody could act on. This is the one place a contact number is rendered
unblurred, and it sits behind the allowlist check, which runs *before* the query
— checked after, the data is already read and the refusal is cosmetic.

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

**Not done, on purpose:** no React Compiler (stable in Next 16, not enabled),
loading states not revisited (three `loading.tsx` files render a bare `Spinner`),
no `CONSTRAINTS.md` (the `constraint-driven-development` skill would add one).

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
  per command, so `retries: N` multiplies the effective per-command timeout — a
  single command can outlive the caller by `timeout * (retries + 1)`. This is why
  `redis.ts` keeps those three settings private: they exist to bound one call
  site, and an exported constant nothing imports invites coupling to a tuning
  decision.
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
- **A schema change and the database are one deploy, not two.** `schema.ts` is
  what the running app compiles against, and development uses the shared
  database (§3), so committing a column without running `db:migrate` breaks the
  app immediately rather than at some later deploy. Adding `reportedAt`
  (`drizzle/0002`) did exactly this: the dashboard threw
  `column "reportedAt" does not exist` from `getUserAds`, and every report
  failed too, because the generated SQL named a column the database did not
  have yet. Two symptoms, one cause — and the second was invisible, because the
  action's `catch` turned the driver error into a generic toast.
  **`getUserAds` is the canary, and deliberately so:** it selects the whole row,
  so it is the first thing to break on a missing column. Restricting it to an
  explicit column list would make the failure *silent* — a field quietly
  `undefined` — instead of loud. The fix is `pnpm db:migrate`, not a narrower
  query. Verifying a migration on a scratch database (§1) proves the SQL is
  correct; it does **not** mean the shared database has it.
- **Excess-property checking does not reach through `flatMap` inference.** A seed
  builder set a column that does not exist and `tsc` was silent; the insert
  succeeded anyway. That is why the seed tests compare against
  `getTableColumns` and derive the required set from `hasDefault`.
- **`Modal` is one box split across two files.** `Content` and `AdCardCompact`'s
  `Wrapper` share it through a `data-modal-box` attribute — set in `Modal.tsx`,
  selected in `AdCardCompact.styles.tsx`. Rename it in one file without the other
  and the dialog draws a card within a card.
- **An awaited server action with no `catch` disables its button forever.**
  `useTransition`'s `isPending` is only cleared when the transition *finishes*, so
  a rejected action that is never caught skips `setIsPending(false)` on every
  path. The button goes dead and nothing on screen says why — a moderation action
  that silently stops responding. `try`/`catch`/`finally`, with `finally` doing the
  reset.
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
trigger is hidden, which is why the region filter is covered by
`e2e/region-filter.spec.ts` and not by a component test.

---

## 5. Testing conventions

The recurring lesson of this repo's testing history: **a test that cannot fail is
worse than no test**, because it is read as proof. Every rule below exists
because its violation shipped; `git log` has the story.

**A live call that succeeds against an empty target is not a verification.** The
call ran, returned no error, and proved nothing — **a wrong key does not error
either.** Before recording any check as verified, confirm the thing it asserts
*could* have failed. Measuring the precondition is part of the check, not a detour
from it. (§9.3 is the worked example: the first attempt at verifying
`utapi.deleteFiles` passed against a bucket holding 0 files.)

- **Revert the fix and confirm it fails before believing a test proves
  something.** `expect(mocks.x).toHaveBeenCalled()` proves nothing.
- **Assert on what the code under test produced, not on what the test produced.**
- **If a constant cannot influence the assertion, the assertion is decorative.**
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even
  when the check is removed.
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
and no Redis.

**Why it took a database constraint and nothing else.** Every alternative was
measured before this one: `db.transaction` throws on the neon-http driver,
`pg_advisory_xact_lock` cannot help under READ COMMITTED, a trigger runs inside
the INSERT's own snapshot, and a partial unique index can only say "at most 1".
The slot index is a write-time conflict on the key itself, so it reads no snapshot
and needs none of those. **A lock is a fourth option and it is not needed:** the
loser of a race gets a 23505, reads it as "slot taken" and moves to the next slot.
That costs one wasted INSERT and cannot produce an over-limit account.

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

The limit is **verified against the real database, not merely asserted**: 20
simultaneous `insertIntoFreeSlot` calls for one throwaway user id yield exactly 2
rows, 18 refusals, and a duplicate-pair insert refused with 23505 — 11 consecutive
runs, always exactly 2. `createAd`'s own doc comment records the reasoning, because
the next person to hit a lost race will read it as a bug rather than the accepted
cost. **One loose end, recorded rather than rounded off:** an early run failed with
a non-23505 driver error that never reproduced in the following 11. `createAd`
handles that path correctly — rethrow, log the cause, return "Could not create the
ad" — so nothing followed from it, and it is noted only because it is the single
unexplained observation from that work.

Known limitation, now closed: the slot keys on the OAuth provider account id, so
a person signing in with both GitHub and Google used to have two ids and could
hold 4 ads. There is now one provider, so one person has one id, and `authOptions`
is pinned to length 1 by a test because a second provider would quietly double the
limit again. **The cost, stated rather than buried:** anyone who only ever signed
in with GitHub can no longer sign in, and their ads are keyed to an id the site no
longer recognises. With one real account that is a deliberate trade, not an
oversight.

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

**Redis is now out of the create path entirely.** The advisory `withUserLock` that
used to wrap `createAd` is deleted, and with it ~800 lines of lock tests;
`checkUploadAdmission`'s ratelimit is the only Redis dependency left in a write.
It was deleted because it was **correct** and still not worth its price: with the
slot index enforcing the limit, the mutex bought the avoidance of a single wasted
INSERT. `src/server/__tests__/retired-user-lock.test.ts` is the tripwire — a lock
that works correctly *alongside* the index would pass every behavioural assertion
there is, which is exactly how it could otherwise come back unnoticed.

### 9.3 Resolved: reporting, a moderation queue, and a takedown

`SPEC-moderation.md` is the spec; `tasks/` holds the plan.

A signed-in visitor can flag a listing from its detail page or its intercepting
modal. `reportAd` marks it, and a moderator sees it at `/moderation` and can take
it down, photos included.

**§9.3 proposed less than it needed, and the gap was the whole point.** It said
"a `reportedAt` column, a report button on the public card, and one query covers
it" — but `deleteAdById` resolves ownership through `findAdOwnedByCurrentUser`
and refuses a non-owner, so whoever answered that query **could not take an ad
down through the app**. The remedy stayed a hand-written `DELETE`, which is the
exact failure the section opens with. A fourth piece was added: a moderator
takedown that bypasses ownership, behind its own check.

Four decisions in it that read as mistakes and are not:

- **The bypass lives in one action.** `deleteAdAsModerator` is separate from
  `deleteAdById` rather than a flag on it, so "can someone delete an ad they do
  not own?" is answered by one file. `deleteAdById`'s ownership check is
  unchanged and is not shared.
- **`reportedAt` is in no public payload** — not in `PublicAd`, not in
  `getValidatedAd`, so not in the RSC payload for `/ad/[adId]`. Omitting the type
  was not enough: `getValidatedAd` selects the whole row, so an explicit
  `detailAdColumns` allowlist is what actually keeps it off the wire.
- **Reported ads stay visible.** Hiding them on report would hand any signed-in
  account a one-click denial of service against any ad id.
- **No rate limit on `reportAd`**, on §9.2's reasoning: at most one report per ad
  already caps the abuse, so a limiter would throttle nothing a spammer cares
  about, and it would put Redis back in a write path.

Each guard was proved by removing it and watching the right test fail: without
`isModerator`, 4 tests fail; with the gate moved below the query, the ordering
test fails; with the teardown order reversed, 2 fail.

**Verified in a real browser** on 2026-10-03, with Playwright driving Chrome
and a live Google sign-in. A moderator session lists the queue; the row order
matches `getReportedAds` exactly against the database; the anonymous path still
refuses. A takedown and an owner delete both ran live — rows and image rows
gone, queue count correct, and `/ad/[adId]` 404s afterwards. The dashboard still
reports the limit as 2 with the slot index holding.

**`teardownAd` genuinely removes files from the bucket, and the evidence is the run
that measured its precondition.** The first attempt passed against a bucket
holding 0 files, which proved nothing (§5). It was repeated after creating an ad
with a real uploaded PNG and confirming via `utapi.listFiles` that exactly one
real, non-`seeded-*` file existed: delete, then all four results asserted — bucket
back to 0, ad row gone, image row gone, `/ad/[adId]` 404s — and `storage:reconcile`
reporting no drift.

### 9.4 Worth doing, not blocking

- **`notFound()` returns HTTP 200, not 404, for a missing ad.** Found 2026-10-03
  by the E2E suite and confirmed with `curl` against a production build:
  `/ad/<missing-uuid>` and `/ad/not-a-uuid` both answer 200, with
  `NEXT_HTTP_ERROR_FALLBACK` in the body and the 404 page rendered correctly.
  `loading.tsx` puts the route behind a Suspense boundary, so the response head is
  committed before `getValidatedAd` has run and `notFound()` can only swap the
  body. The visitor sees the right thing; anything reading the status — a search
  engine, an uptime monitor, a CDN — does not. The fix is to not put this route
  behind a streaming boundary, or to set the status before the shell flushes.
  `e2e/ad-detail.spec.ts` asserts the *rendered* 404 and deliberately does not
  assert a 404 status, because asserting one would be asserting a fix that has not
  been made.

- **Every seeded ad photo 404s.** See §2.2 — a dead `images.url` behind a
  synthetic `fileKey`, which is why `storage:reconcile` reports no drift anyway.

- **No account deletion.** Name, OAuth id and phone are stored with no erasure
  path. `deleteAdById` covers one ad, not the account.
- **No email contact channel**, which is also the only route to verifying that a
  poster controls the number they published.
- **A cursor pager for `getAllAds`.** The moderation page's "all ads" list is
  bounded to `PAGE_SIZE` (10) with no pager, so of 194 seeded rows only 10 are
  reachable. Flagged, not requested.

### 9.5 Not on this list, deliberately

- **An admin UI** — still excluded, and §9.3 did not quietly add one. The
  moderation surface is a list and a few buttons; there is no user management, no
  content editing and no dashboard.

  **`ConfirmDialog` is the one dialog, and that is enforced rather than
  remembered.** `DeleteAdButton` once carried its own copy — `Alert.Root`,
  `Overlay`, `Content`, `Title`, `Description` and a second set of overlay
  keyframes, about 50 lines kept in step by hand — which is the drift this bullet
  describes rather than a hypothetical version of it. It now uses the shared
  component, with `ConfirmDialog` taking a `trigger` element so the owner's
  control keeps the design-system `Button` instead of changing appearance as a side
  effect of the refactor. `DeleteAdButton.test.tsx` reads the source and fails if a
  second dialog is ever built alongside it — from source, because "there is no
  duplicated dialog here" is an absence, which no rendered tree can distinguish
  from a dialog that has not been opened yet.
- **The dev/prod database split** — §3 explains why it is a deliberate choice, and
  §8 covers the sharing. Real users appearing *is* the trigger to revisit, so it
  belongs on this list in spirit, but it is a database-provisioning task rather
  than an application change.