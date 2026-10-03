# HANDOFF

State of the repository and what to do next, for a reader with no memory of the work.

Facts only. Anything recoverable from `git log`, the code comments or the README is
not repeated here, and neither is the history of how a bug got fixed — if you want
the history of a decision, `git log -S` finds it.

- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, **625 tests
  across 61 files**, `next build` succeeds. `pnpm test:e2e` adds **43 Playwright
  specs** (§2.1), run by hand and not wired into CI.
- **Database:** one Neon database (`neondb`) shared by development *and* production
  (§3). **200 generated ads, 398 images**, all seeded, every photo URL resolving.
  Also holds 128 KB of abandoned tables from two older projects (§8). The UploadThing
  bucket is empty and agrees with the database.
- **Production is live** at `mampokoj.vercel.app` and the moderation queue works
  there (§9.3). **Env vars are set in the Vercel dashboard by hand** — §1, which is
  the item most likely to waste an afternoon.
- **Clean tree** on `main` at `9d11164`, two commits ahead of `origin/main` — the
  two sessions below are committed but **not pushed**.

## Shipped 2026-10-03

Four pieces of work, all verified against a production build rather than against
the dev server, which hides status-code and streaming failures.

1. **SEO.** Ad pages are indexable: per-ad Open Graph cards and JSON-LD,
   `sitemap.xml`, `robots.txt`, Czech metadata and `lang="cs"`, and a real HTTP
   **404** for a removed ad (previously 200 — §9.4). Region pages are canonicalised
   in place with the pagination cursor stripped; **no `/region/[code]` routes**, on
   purpose (§3).
2. **Seeded photos.** The 11 hardcoded `ufs.sh` URLs in `seed-data.ts` were all
   dead; `seededPhotoUrl(adId, index)` now emits deterministic
   `picsum.photos/seed/…` URLs and the table was re-seeded. §2.2.
3. **Unvalidated `cursorId` 500'd the home page.** Now
   `src/lib/validation/cursor.ts`, shared by `page.tsx`, `/api/ads` and
   `/moderation`. §9.4.
4. **A cursor pager for the moderation "all ads" list**, which was capped at 10 of
   200 rows. §9.4.

The three work files (`tasks/todo.md`, `tasks/plan.md`) were folded into this file
and deleted. Nothing else reads them.

---

## Also shipped 2026-10-03

`todo.md` items 1–3, in two commits. Each item is marked in `todo.md` with the
reasoning; what follows is only what belongs here.

1. **Error boundaries.** `src/app/error.tsx` and `src/app/global-error.tsx`, with
   18 cases in `src/app/__tests__/error-fallbacks.test.tsx`. Two details worth
   knowing before touching either file: `global-error.tsx` applies theme tokens
   in a `useLayoutEffect`, **not** an inline `<script>` — the script never runs,
   because Next serves a shell and renders the boundary client-side, where React
   does not execute `<script>` at all — and it reads `var(--token)` for its
   colours rather than literals, which is only correct because of that layout
   effect. §4.
2. **Region links open in a new tab.** `RegionNavigation` keeps `router.push` for
   plain left clicks and declines everything else (§3).
3. **Both ad forms now use `useActionState`.** This was filed as docs alignment
   and turned out to be two live defects — the submit button was **never**
   disabled, so a double submission was a duplicate write. §3, §4.

---

## 1. Environment facts that will otherwise waste your time

1. **Upstash Redis resolves from this machine and responds** (`PING` → `PONG`).
   This is the opposite of what earlier sessions recorded (`ENOTFOUND`), and it is
   what makes uploads work. It has one remaining consumer, `ratelimit.ts`.
   **Do not assume it from a test** — the suite mocks Redis, and a mocked Redis
   proves nothing about a live one. If something Redis-backed looks broken, ping it
   first; the failure mode is silent rather than loud.
2. **`MODERATORS` lists OAuth account ids, not email addresses.** Read by
   `src/lib/moderator-guard.ts`; the value is the id in your own
   `/dashboard/<userId>` URL and the one `ads.userId` holds. **An email here never
   matches and the allowlist fails closed**, so the symptom is `/moderation`
   refusing forever with nothing in the logs — the single most confusing failure
   this app has. It is deliberately not written down in this repo, which is public.
   **Set it per environment in the Vercel dashboard, by hand.** Vercel scopes env
   vars, so a Production-only value leaves Preview deployments refusing in exactly
   the same silent way. It is not a secret: it gates the *web* surface, and anyone
   who can run a script with the repo's `.env` is already fully privileged.
3. **Postgres is reachable and `CREATE DATABASE` is permitted**, which is how
   migrations get verified rather than assumed. Two consequences: the connection
   string uses the **`-pooler` host**, so a scratch database cannot be dropped
   until its idle sessions are terminated
   (`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '<db>'
   AND pid <> pg_backend_pid()`); and `tsx` scripts importing `dotenv/config` must
   live **inside the repo** — from `/tmp` the module does not resolve.

---

## 2. Open work

**`todo.md` is the work list**, audited against the Next.js 16.3.6 docs in
`node_modules/next/dist/docs/` — 11 items in value-per-effort order, each citing
the guide it comes from. Cache Components and Instant Navigation are excluded by
decision, with the reasoning recorded there. Read it before §9.4.

**Items 1, 2 and 3 are shipped** (see *Also shipped* above). Item 3 found two live
defects rather than a docs mismatch, which is the argument for continuing down the
list rather than stopping: read a component before assuming an entry describes a
style problem.

**The next session should start at `todo.md` item 4**, then work down the list, then
§9.4. Item 4 (`useSearchParams()` for a value the server already has) is small and
independent. Nothing is blocking: §9.1–§9.3 are closed, and the two items that
needed a decision (E2E's scope, and retiring `withUserLock`) have both been taken.
What is left is items 4–11, §9.4, and the two deliberate omissions in §2.3.

**One entry on `todo.md` is now known to be bigger than filed.** Item 3's
progressive enhancement is *not achieved* — the forms live in a modal, so the
server-rendered HTML contains no `<form>` at all and cannot post without
JavaScript. Both files say so at the call site. Finishing it needs a
server-rendered create/edit route, which is a product decision, not a refactor.
The reasoning for leaving it is recorded in `todo.md`; revisit it only with
evidence about how often JavaScript actually fails for real users.

### 2.1 End-to-end tests: local-only, by hand

`pnpm test:e2e` runs 43 specs covering browse → region filter → load more → ad
detail → intercepting modal → not-found → moderation-adjacent SEO. Config is
`playwright.config.ts`, specs in `e2e/`.

No CI wiring and no database provisioning. `webServer` reuses whatever `pnpm dev`
is already running, or starts one, and the suite runs against whatever
`DATABASE_URL` points at. `E2E_BASE_URL=http://localhost:3100` points it at a
production build instead — **do that before a release, not only against dev**,
because streaming behaves differently.

**Every spec is an anonymous read.** That is why they are safe against the shared
database, and also why there is no E2E coverage of the ad limit, the report
predicate or the moderation takedown: those need a signed-in session and a
disposable database. The two rejected alternatives, for whoever reopens this: a
**Neon branch per run** needs an API token as a CI secret plus branch
create/drop and teardown-on-failure plumbing; a **local `postgres` container**
needs a driver swap, because `@neondatabase/serverless`'s HTTP driver will not
talk to local Postgres over TCP.

Three things this suite found that unit tests could not:

1. **A streamed page holds two copies of itself.** Next emits the resolved content
   into a bare `<div>` on `document.body` alongside the real page inside
   `MaxWidthWrapper`, and an inline script moves it into place a moment later. A
   locator read as soon as `goto` resolves therefore sees 20 ad links on a page
   that renders 10 — in development *and* in a production build. `e2e/support/
   app-shell.ts` scopes every query to the layout shell for this reason.
   **Anything else that reads this DOM early — a scraper, a monitoring probe,
   another suite — has the same problem.**
2. **`notFound()` in a streamed route answers HTTP 200, not 404** (§9.4).
3. **An anonymous visitor's detail page has no `tel:` link at all** — it renders
   "Log in to see the contact". `BlurredPhone` is the *signed-in* affordance.

### 2.2 Smaller items

- **Run `pnpm storage:reconcile` by hand after any incident involving uploads or
  deletes, and before assuming the bucket is empty.** UploadThing bills a file
  before its row is written and removes it before the row, so a crash, an outage
  or a rate limit leaves one side pointing at nothing. Dry run by default;
  `--delete` removes orphans. Not automated and not scheduled.
- **`next-auth` is on the stable v4 line** (`4.24.14`): `NextAuthOptions`,
  `getServerSession`, `signIn`/`signOut`, `Session`. v5 has been beta for years
  and changes the config shape, so treat a move to it as its own task with the
  auth surface's tests green either side — not as a version bump.
- **Deferred upgrades**, one per change with a green suite either side: `motion`
  12→13, `eslint` 9→10, `@types/node` 20→26, `typescript` 5→7.
- **Seeded data state:** `pnpm db:seed` writes 100 ads per run and is additive, so
  the count grows by 100 each time. Seed **twice** if you wipe it: 100 ads across
  14 regions leaves Prague with under a page, and `e2e/load-more.spec.ts` then
  *skips* its pagination assertions — and a skipped test reports green.

### 2.3 Deliberately not done

- **No OG image for the home page.** The root card is inherited by every route
  that does not override it, and a site-wide default would advertise a listing
  that does not exist. The ad page uses the ad's own photo. A generated `next/og`
  image per region is the natural follow-up.
- **No image sitemaps — and this one needs re-deciding, not inheriting.** They were
  declined *because* `images.url` pointed at files that no longer exist and
  advertising 200 dead URLs to Google is worse than none. Those URLs resolve again
  (§9.4), so the objection is gone and this is an open option.
- **No `hreflang`.** One language. Revisit if a second is ever added.
- **No React Compiler** (stable in Next 16, not enabled), **loading states not
  revisited** (three `loading.tsx` files render a bare `Spinner`), **no
  `CONSTRAINTS.md`.**

---

## 3. Decisions that look like mistakes but are not

Each is deliberate, reasoned in the file named, and pinned by a test where a
comment would not hold.

**`upload-guard.ts` fails closed.** It awaits `ratelimit.limit()` with no
`try/catch`, so an unreachable Redis breaks uploads. A quota is not an
authorization boundary, so failing open turns an outage into an abuse window — the
mechanism *is* the control. **Do not "fix" this toward failing open.** It is the
only Redis dependency left in a write path (§9.2).

**The moderator allowlist fails closed**, which is the opposite trade from the line
above and equally deliberate: unset, empty or malformed means nobody moderates,
because the failure mode of an open allowlist is a takedown button anyone can press.

**One database for dev and production.** Found, not designed: Vercel's
`DATABASE_URL` points at the dev database. Kept, because for a portfolio project
with no real users production keeps demonstrating itself. **Do not "create a second
database" as a fix.** Real users appearing is the trigger to revisit — not the Free
plan, which allows 100 projects and where this database uses under 9 MB of 1 GB.
The `SEED_ALLOW` guard (`src/utils/seed-guard.ts`) covers CI and a fresh clone but
**not** production, since env vars are set in the Vercel dashboard by hand (§1);
that limit is stated in the guard's header rather than papered over.

**The home page stays at `src/app/page.tsx`, and its `loading.tsx` lives in a
`(browse)` group rather than beside it.** This looks like a mistake twice over — the
group has exactly one file that does not need to be there, and the obvious
arrangement is `page.tsx` next to `loading.tsx`. Moving it **breaks the
intercepting modal**, because `@modal/(.)ad/[adId]` resolves `(.)` by
**route-segment level** and a route group counts toward that level even though it
adds no URL segment. The symptom is quiet: the URL still changes on a card click,
so only the assertions that the grid is *still mounted behind the dialog* notice.
`(..)` cannot fix it — Next rejects it at the root level. The reason it is not
simply `src/app/loading.tsx` is the 404 status (§9.4).
`noindex-private-routes.test.ts` asserts both halves, because the failure mode in
both directions is a test that still passes.

**No `/region/[code]` routes.** Region filtering is `?region=`. A new path segment
changes the level at which `@modal/(.)ad/[adId]` intercepts, which silently stops
the ad modal opening on region pages.

**`getReportedAds` and `getAllAds` select `contactPhone` and `userId`, which every
public query withholds.** A scam is recognised by the number, and taking an ad down
means knowing whose ad it is. Reusing `publicAdColumns` would have produced a queue
nobody could act on. This is the only place a contact number is rendered unblurred,
and it sits behind the allowlist check, which runs *before* the query — checked
after, the data is already read and the refusal is cosmetic.

**Reconciliation deletes orphans but never dangling rows.**
`storage:reconcile.tsx` reports a row whose file is missing in the bucket and then
leaves it alone. That asymmetry is the whole design: a missing file does not prove
the row is unwanted — a deleted ad's rows, an in-flight UploadThing deletion and
genuine damage are indistinguishable from outside — and deleting one destroys user
data, where keeping it costs a broken thumbnail. **Do not "complete" it by deleting
dangling rows.** The plan lives in `src/utils/storage-reconcile-plan.ts`, which is
pure and where the reasoning is asserted.

**Seeded rows are excluded from that report, and it is not a filter for taste.**
Their synthetic `seeded-<uuid>` keys never existed in the bucket, so every seeded
row is permanently "dangling" by the rule above; measured against the live bucket,
without this rule the script reports all 398 seeded rows as damage. Since dev and
production share a database, acting on that report would delete a hundred generated
listings' worth of rows. If the seed key format in `seed-data.ts` ever changes, this
prefix has to change with it.

**There is no `SessionProvider`.** `AuthButton` was the last caller of
`useSession()`; it takes the session as a prop from the layout, so the header is
correct in the SSR HTML instead of rendering a spinner and popping into place on
every navigation. With no consumer it was deleted. If you add a caller that needs
`useSession()`, add the provider back with it — `signIn`/`signOut` work without one.

**The 404 *status* is the only thing producing `noindex` on the not-found page.**
Next emits the tag automatically for a 404; declaring `robots` in the metadata as
well produced two conflicting tags.

**A client function passed to `<form action>` gets no pending state, so neither ad
form guards its submit button any other way.** Both forms used to hand-roll
`useState` and disable the button on it; that never worked, because the handler is
not run inside a transition, so the update was not flushed until the action
settled — by which point it had been set back to false. The duplicate write it
allowed is invisible from the response (`createAd`'s slot loop absorbs it into the
next free slot and both calls report success), which is why it survived. The
button is now disabled from `useActionState`'s third return value, which comes
from React's action queue. **Do not reintroduce a `useState` flag here**, and note
that disabling the button alone is not sufficient — Enter in a text field is
implicit submission, which a disabled button does not block.

**A submission failure is rendered in the form, not toasted, and no toast at all
for a success path that navigates away.** A toast vanishes in seconds while the
form says nothing, so the visitor's only lasting record of a refusal was one they
had stopped looking at. The message sits directly above the submit button with
`role="alert"`, rather than at the top of a scrollable modal where it can be
off-screen.

**The ad forms are not progressively enhanced, and that is accepted.** `curl` of
`/dashboard/[userId]` returns zero `<form>` elements, because `Modal` renders its
children only once a click sets `open` — so no-JS cannot post, whatever the
`action` prop is. Both components say this at the call site. It was considered and
declined: the site's posture is "read and navigate without JS, write with JS",
which suits an authenticated page that is `noindex` and disallowed in `robots.txt`,
and a dedicated create/edit route would trade the modal's context for a narrow
gain. **A no-JS version would still be incomplete** — Radix `Select` needs
JavaScript to open, so `region` would have no usable control.

**The header's controls share one box model because there is only one.**
`HeaderControl.tsx` owns the styling; `ControlLabel` (desktop) and
`ControlNameOnly` (never visible) are the same idea in two shapes, and picking the
wrong one is a visible regression, so `Header.test.tsx` asserts which each got.

---

## 4. Traps

Each of these cost real time.

- **Any module calling `styled.*` or `createGlobalStyle` needs `'use client'`.** A
  styled component in a Server Component generates its rule during the RSC pass,
  where it lands in the flight payload and is never emitted — and nothing recovers
  it, because a Server Component does not re-render on the client.
  `StyledComponentsRegistry` does not help; its `StyleSheetManager` only wraps the
  client pass. An `async` Server Component cannot hold the directive, so those keep
  their styled definitions in a sibling `*.styles.tsx` that does — `AdCard`,
  `AdCardCompact`, `MainColumn`, `app/page.tsx`, `app/dashboard/[userId]/page.tsx`,
  `app/moderation/page.tsx`. `src/__tests__/styled-components-boundary.test.ts`
  fails if you move one back. **To check by hand:** `curl` a route, collect the
  class names, and confirm each appears in a `<style>` element or a linked
  stylesheet. A class appearing only inside a `<script>` is dead CSS.
- **Global rules are in `src/app/globals.css`** — same failure one level up; a
  stylesheet linked from `<head>` needs no boundary.
- **A custom property that resolves to nothing is silent.** For an inherited
  property the declaration is invalid at computed-value time and the element keeps
  its parent's value. `src/__tests__/tokens.test.ts` fails on this.
- **The neon HTTP tagged template binds *everything*.** Any interpolation becomes a
  `$1` parameter, so an identifier or array passed through it yields
  `INSERT INTO $1` or `malformed array literal`. Use
  `sql.query('... VALUES ($1,$2)', [a, b])` when a statement needs both a literal
  table name and bound values.
- **`client.unsafe()` is a fragment for that template, not a query executor.**
  Awaited on its own it returns the SQL it was handed, having run nothing — no
  error, no rows — so `CREATE DATABASE` and the next statement both look fine while
  the database was never created.
- **A unique violation does not arrive where you look.** Drizzle wraps driver
  errors, so 23505 reaches you as a `DrizzleQueryError` with `code: undefined`; the
  real `NeonDbError` is on **`.cause`**.
- **`Redis.fromEnv()` does not throw when the variables are missing** — it warns and
  returns a client that fails on every call. Set the variables in `vi.hoisted`,
  before the import runs.
- **The Redis client's `signal` is a factory evaluated per HTTP request**, so
  `retries: N` multiplies the effective per-command timeout — one command can
  outlive the caller by `timeout * (retries + 1)`. That is why `redis.ts` keeps those
  settings private: an exported constant nothing imports invites coupling to a tuning
  decision.
- **`getTableConfig(table).columns` is an array** on drizzle-orm 0.45, not a
  name-keyed record. `Object.keys()` over it yields `'0'`, `'1'`, … and a test built
  on that asserts nothing while looking correct.
- **`tsx` compiles to CJS here** (no `"type": "module"`), so top-level `await` fails
  in a scratch script. Wrap it in an async function.
- **`server-only` is an alias Next provides, not a package that resolves on its
  own.** `tsx` resolves neither, so a `tsx` script importing any `server-only`
  module fails `MODULE_NOT_FOUND`. It is a real dependency now and
  `storage:reconcile` passes `--conditions=react-server`. Applies to every future
  `tsx` script.
- **`drizzle-kit migrate` exits non-zero on failure but prints nothing about what
  failed.** Diagnose by running the SQL by hand. (`db:baseline`'s errors do explain
  themselves.)
- **`utapi.listFiles` is paginated, and a partial read looks like a bucket full of
  orphans.** Reconcile pages until `hasMore` is false; without that, every file past
  the first page looks unreferenced and `--delete` would remove live photos.
- **`db:migrate` can be a silent no-op, because the migration ledger is not
  prefixed.** See §8.
- **A schema change and the database are one deploy, not two.** `schema.ts` is what
  the running app compiles against and development uses the shared database, so
  committing a column without running `db:migrate` breaks the app immediately.
  Adding `reportedAt` (`drizzle/0002`) did exactly this: the dashboard threw
  `column "reportedAt" does not exist` from `getUserAds`, and every report failed
  behind a generic toast. Two symptoms, one cause — and the second was invisible
  because the action's `catch` turned the driver error into a toast.
  **`getUserAds` is the canary, and deliberately so:** it selects the whole row, so
  it is the first thing to break on a missing column. Narrowing it to an explicit
  column list would make the failure *silent* — a field quietly `undefined` —
  instead of loud. The fix is `pnpm db:migrate`, not a narrower query. Verifying a
  migration on a scratch database (§1) proves the SQL is correct; it does **not**
  mean the shared database has it.
- **Excess-property checking does not reach through `flatMap` inference.** A seed
  builder set a column that does not exist and `tsc` was silent; the insert
  succeeded anyway. The seed tests compare against `getTableColumns` and derive the
  required set from `hasDefault` for this reason.
- **`Modal` is one box split across two files.** `Content` and `AdCardCompact`'s
  `Wrapper` share it through a `data-modal-box` attribute — set in `Modal.tsx`,
  selected in `AdCardCompact.styles.tsx`. Rename it in one file without the other
  and the dialog draws a card within a card.
- **An awaited server action with no `catch` disables its button forever.**
  `useTransition`'s `isPending` is only cleared when the transition *finishes*, so a
  rejected action that is never caught skips the reset on every path. The button
  goes dead and nothing on screen says why — a moderation action that silently stops
  responding. `try`/`catch`/`finally`, with `finally` doing the reset.
- **A client function in `<form action>` will not flush a `useState` update made
  inside it** — the handler is not in a transition, so nothing renders until it
  settles. A pending flag written that way is inert and reads correctly. See §3.
- **React resets a form whose `action` is a function** (`recursivelyResetForms` in
  react-dom), so **every field is cleared after a submission, success or
  failure**. Both ad forms behaved this way before the `useActionState` change
  too, so it is not a regression — but "keep what the user typed after a failure"
  does not hold here, and the update form is where it costs most, because its
  fields are pre-filled defaults that came from the database and are now gone.
  Preserving them means making every field controlled.
- **The reset lands asynchronously**, after the action's promise resolves. A test
  that refills the form straight after a submit appends to the values that are
  still there ("A roomA room"), and then fails `maxLength` on the phone field, so
  the second submission is refused by validation and the action is never called —
  which reads as "the button does nothing" rather than as a stale fill.
- **An action left in flight when a test ends resolves during whichever test runs
  next**, against an unmounted component, and lands its `showToast`/`router.push`
  calls in the *following* test's mocks. Three tests failed this way while passing
  alone. Release and await, in a `finally` where possible.
- **A stale `next start` on :3000 will be reused by the E2E suite**
  (`reuseExistingServer: true`) and will be broken by any `pnpm verify` running a
  rebuild underneath it. This produced 11 convincing failures against correct code.
  `pkill -f "next start"; lsof -ti:3000 | xargs kill -9` before trusting a red run.
- **This machine's `~/.npmrc` sets `min-release-age=3` days** (pnpm surfaces it as
  `minimumReleaseAge: 4320`). A *machine* supply-chain guard, not a repo setting —
  do not disable it. The effect is that `next` lags npm by up to three days, so a
  version being installable is not evidence it is the newest. Check `npm view next
  time`.

Component-test specifics: `AdGrid` and `AdPhotosGallery` need `vi.mock` for
`next/navigation` and `../ToastProvider` (`useSearchParams` returns null outside a
router); `RegionSelectBlock` is `display: none` under jsdom, so queries need
`{ hidden: true }`; Radix `Select` will not open its portal in jsdom while the
trigger is hidden, which is why the region filter is covered by
`e2e/region-filter.spec.ts` and not by a component test.

---

## 5. Testing conventions

The recurring lesson of this repo's testing history: **a test that cannot fail is
worse than no test**, because it is read as proof.

**A live call that succeeds against an empty target is not a verification.** The
call ran, returned no error, and proved nothing — **a wrong key does not error
either.** Before recording any check as verified, confirm the thing it asserts
*could* have failed. Measuring the precondition is part of the check, not a detour
from it. (§9.3 is the worked example: the first attempt at verifying
`utapi.deleteFiles` passed against a bucket holding 0 files.)

- **Revert the fix and confirm it fails before believing a test proves something.**
  `expect(mocks.x).toHaveBeenCalled()` proves nothing.
- **Assert on what the code under test produced, not on what the test produced.**
- **If a constant cannot influence the assertion, the assertion is decorative.**
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even when
  the check is removed.
- **Restore a spy only after asserting on it.** `mockRestore()` also resets
  `mock.calls`.
- **Say what a test catches, not what you hope it catches.**
- **A reviewer's finding is data, not a verdict.** Several confidently asserted
  findings in this repo's history were wrong.
- **Never write an unscoped `db.delete`** in a file described as temporary, next to
  a real database. Prefer no delete at all: seeding is additive, so restoring is
  `pnpm db:seed` again. If a delete is unavoidable, scope it by a known test marker
  — **never by a timestamp**, because a seeded batch shares one `createdAt` and any
  cutoff computed from the data is the same fact as the data.

Server-side test files start with `// @vitest-environment node` (the default is
jsdom). Tests live in `__tests__` folders beside the code.

**jsdom enforces native constraint validation**, so a submit through a button does
nothing at all while a `required` field is empty — the action is never called, and
the failure looks like "the button does nothing". `RegionSelect`'s hidden
`<select>` is *not* `required`, so an unset region does not block a test; the
server rejects it instead.

**In a component test of a Radix `Modal`, scope queries with
`within(screen.getByRole('dialog'))`.** Unscoped, `getAllByRole('button', …)`
matches the trigger *and* the submit, and `findByText` collides with the same
string printed outside the modal — "Maximum 2 ads per user" is both the create
button's caption and `createAd`'s refusal message. Both collisions read like bugs
in the form and are not. The submit button is the **last** match once open.

**jsdom does not evaluate `@media`, so a responsive CSS bug is invisible to a
component test.** `Header.test.tsx` asserts both halves for that reason: a
`getByRole(name)` check, which proves a control is named *as rendered*, and a
`document.styleSheets` check, which proves the name survives the phone breakpoint.

---

## 6. Migrations

`drizzle/` is committed (`0000`…`0003`), with `db:generate`, `db:migrate` and
`db:baseline`. CI runs `db:generate` and fails if it produces a diff, so a schema
change cannot reach production without its migration.

`generate` compares `src/server/db/schema.ts` against `drizzle/meta/_journal.json`,
not against a live database, so a create-from-zero baseline falls out of an empty
`drizzle/` offline. No scratch database is needed to *write* a migration, only to
verify one.

**The shared database is baselined** — `0000_init` and `0001_breezy_warstar` are
recorded in `drizzle.__drizzle_migrations`, so `db:migrate` runs normally and there
is no `db:baseline` step in any release. That ledger is unprefixed and therefore
shared with any future drizzle project on this database (§8). For a database that
predates the migration files, `db:baseline` records the baseline without running it,
and refuses unless both tables are already present — baselining an empty database
would leave `db:migrate` convinced the schema exists.

---

## 7. The ad limit is a database invariant

`ads` carries a `slot smallint` with a unique index on `(userId, slot)`.
`createAd` walks the slots from 0 and inserts into the first one nobody holds,
reading the 23505 off `error.cause` (§4) and treating it as "this slot is taken"
rather than as a failure. A user at the limit holds every slot, so every attempt
conflicts and the cap is Postgres refusing a duplicate pair — with no transaction
and no Redis.

**Why it took a database constraint and nothing else.** Every alternative was
measured first: `db.transaction` throws on the neon-http driver,
`pg_advisory_xact_lock` cannot help under READ COMMITTED, a trigger runs inside the
INSERT's own snapshot, and a partial unique index can only say "at most 1". The slot
index is a write-time conflict on the key itself, so it reads no snapshot. **A lock
was a fourth option and was deleted** (§9.2).

Invariants a change here must preserve, each asserted somewhere:

- The unique pair must stay **unique and over exactly `(userId, slot)`** —
  `migrations.test.ts` asserts it in the schema and in the migration SQL, because a
  non-unique or narrower index puts the limit back on a count.
- A 23505 on this insert means "slot taken". The only other unique constraint on
  `ads` is the random primary key; if a second unique index is ever added,
  discriminate on `error.cause.constraint` rather than the code alone.
- `slot` is **not public** — listed in `PublicAd`'s `Omit` and asserted by
  `ad-dto.test.ts`. A new column arrives there through `InferSelectModel` and breaks
  `tsc` until someone decides otherwise (`ad-dto.ts`'s fail-closed design).
- Re-seeding is safe because `seed-data.ts` gives every ad a fresh `userId`, so each
  seeded row takes `slot = 0` with nothing to collide against.

The limit is **verified against the real database, not merely asserted**: 20
simultaneous `insertIntoFreeSlot` calls for one throwaway user id yield exactly 2
rows and 18 refusals — 11 consecutive runs, always exactly 2. `createAd`'s own doc
comment records the reasoning, because the next person to hit a lost race will read
it as a bug rather than the accepted cost.

**The cost of one provider, stated rather than buried:** the slot keys on the OAuth
account id, so a person signing in with both GitHub and Google used to hold 4 ads.
There is now one provider, `authOptions` is pinned to length 1 by a test, and anyone
who only ever signed in with GitHub can no longer sign in. With one real account
that is a deliberate trade, not an oversight.

---

## 8. This database holds leftovers from two abandoned projects

`neondb` is shared across several of this owner's projects by choice, and the
`mampokoj_` table prefix keeps them apart. Four tables in `public` are **not** this
repo's, and one schema is empty:

| object | rows | what it is |
|---|---|---|
| `mampokoj_ads` | 200 | this repo, all seeded |
| `mampokoj_images` | 398 | this repo, all seeded |
| `users`, `customers`, `invoices`, `revenue` | 1 / 6 / 11 / 12 | a tutorial project, **abandoned** |
| `roomFinder` (schema) | empty | an older project, **abandoned** |

They are residue, not live neighbours. They carry no foreign keys to each other or
to anything else, so dropping them would break no constraint — but there is also no
reason to, at 128 KB against a 1 GB per-project Free allowance. **Do not write a
migration that drops them.** They are not this repo's to delete, and a migration is
permanent while a manual `DROP TABLE` is one command you can see first.

**Isolation is by table prefix, and it holds.** `pgTableCreator` in `schema.ts`
renames every table to `mampokoj_*` and `drizzle.config.tsx` sets
`tablesFilter: ['mampokoj_*']`. The filter is applied when drizzle-kit introspects
the live database, so unprefixed tables are never read — which is also why
**`pnpm db:push` is safe here**.

**The one gap: `drizzle.__drizzle_migrations` is a single unprefixed table**, named
by library default, and the migrator decides what to run from **only the newest row**
(`order by created_at desc limit 1`). A newer row written by any other drizzle
project on this database would make `db:migrate` skip everything here — silently, no
error, no tables created. **That cannot happen today:** measured, the whole database
has exactly one migration table and it holds this repo's four rows; the abandoned
projects never ran drizzle's migrator. The gap becomes real the moment a *new*
project starts using drizzle against this database, which is when to set
`migrationsSchema: 'mampokoj_drizzle'` in `drizzle.config.tsx` **and** the matching
`MIGRATIONS_SCHEMA` in `src/utils/baseline.tsx`, before its first migration.

---

## 9. Taking real users: what stands between this and a live site

The app runs, and the authorization core is genuinely solid — ownership is settled
in the query predicate rather than after the read, and the public payload is
allowlisted twice. That part needs no work. What follows is what changes when the
users are real landlords rather than seeded rows.

### 9.1 Resolved by decision: any signed-in visitor may see a listing's phone

`getValidatedAd` selects the whole row, and both cards render the number for any
signed-in visitor, blurred until clicked. That is the intended product rule — the
gate is "signed in", not "is the poster" — so this is not a hole. What remains true,
documented in `BlurredPhone`'s tests rather than fixed: the blur is a courtesy
against shoulder-surfing, not a security boundary, because the digits are in the
HTML for every signed-in visitor.

### 9.2 Resolved: the ad limit is a database invariant

Closed by the slot index (§7). An outage, or anyone who can make Redis unreachable,
can no longer mean unlimited ads per account.

There is still no *rate* limit on `createAd` — and there does not need to be. A hard
cap of two ads per account already refuses the third create however fast it arrives.
`checkUploadAdmission`'s ratelimit stays, because there the abuse is bandwidth
rather than row count.

**Redis is out of the create path entirely.** The advisory `withUserLock` that used
to wrap `createAd` is deleted, and with it ~800 lines of lock tests. It was deleted
because it was **correct** and still not worth its price: with the slot index
enforcing the limit, the mutex bought the avoidance of a single wasted INSERT.
`src/server/__tests__/retired-user-lock.test.ts` is the tripwire — a lock that works
correctly *alongside* the index would pass every behavioural assertion there is,
which is exactly how it could otherwise come back unnoticed.

### 9.3 Resolved: reporting, a moderation queue, and a takedown

`SPEC-moderation.md` is the spec and still the authoritative description of this
feature; the work log it referenced has been folded into this file.

A signed-in visitor can flag a listing from its detail page or its intercepting
modal. `reportAd` marks it, and a moderator sees it at `/moderation` and can take it
down, photos included.

**§9.3 originally proposed less than it needed, and the gap was the whole point.**
It said "a `reportedAt` column, a report button, and one query covers it" — but
`deleteAdById` resolves ownership through `findAdOwnedByCurrentUser` and refuses a
non-owner, so whoever answered that query **could not take an ad down through the
app**. The remedy stayed a hand-written `DELETE`, the exact failure the section
opens with. A fourth piece was added: a moderator takedown that bypasses ownership,
behind its own check.

Four decisions in it that read as mistakes and are not: **the bypass lives in its
own action** (`deleteAdAsModerator`, never a flag on `deleteAdById`, whose ownership
check stays unchanged and unshared); **`reportedAt` is in no public payload**,
which needed an explicit `detailAdColumns` allowlist because `getValidatedAd`
selects the whole row and a type omission does not keep a column off the wire;
**reported ads stay visible**, since hiding them hands any signed-in account a
one-click DoS against any ad id; and **no rate limit on `reportAd`**, on §9.2's
reasoning.

Each guard was proved by removing it and watching the right test fail: without
`isModerator`, 4 tests fail; with the gate moved below the query, the ordering test
fails; with the teardown order reversed, 2 fail.

**Verified in a real browser**, with Playwright driving Chrome and a live Google
sign-in: a moderator session lists the queue, the row order matches
`getReportedAds` exactly against the database, the anonymous path still refuses, a
takedown and an owner delete each removed rows and image rows and left
`/ad/[adId]` answering 404, and the dashboard still reported the limit as 2.

**`teardownAd` genuinely removes files from the bucket, and the evidence is the run
that measured its precondition** — repeated after creating an ad with a real
uploaded PNG and confirming via `utapi.listFiles` that exactly one real,
non-`seeded-*` file existed: delete, then all four results asserted (§5).

Two deviations worth keeping, since the plan is gone: `ReportButton` has a disabled
"Reported" state that is **session-local truth** and resets on reload — the server
cannot tell the component the ad is flagged, because `reportedAt` is withheld from
every public payload. And GitHub sign-in was removed entirely once the maintainer's
account id was known, which dissolved the two-identities problem in §7.

### 9.4 Worth doing, not blocking

- **`notFound()` returned HTTP 200, not 404, for a missing ad. Fixed 2026-10-03.**
  `loading.tsx` sat at the app root, putting a Suspense boundary above every route:
  the response head was committed before `getValidatedAd` had run, so `notFound()`
  could only swap the body and the status line had already gone out as 200, with
  `NEXT_HTTP_ERROR_FALLBACK` in the payload. The visitor saw a correct 404 page and
  every crawler, uptime monitor and CDN saw a success.

  The fix moved that boundary into a `(browse)` route group, which adds no URL
  segment, so `/` is unchanged and `/ad/[adId]` renders without a boundary above it.
  Both cases now answer 404, measured with `curl` against a production build.
  **The cost of the obvious alternative is in §3** — it breaks the modal. And the
  404 *status* is now the only thing producing `noindex` on that page, so if the
  streaming boundary ever comes back the page silently becomes 200 *and* indexable.
  `noindex-private-routes.test.ts` asserts no root `loading.tsx` exists for exactly
  this reason.
- **An unvalidated `cursorId` 500'd the home page. Fixed 2026-10-03.** There were
  **two** bugs, not one: `?cursorId=not-a-uuid` was `invalid input syntax for type
  uuid`, and `?cursorCreatedAt=not-a-date` was a separate `RangeError: Invalid time
  value`, because `new Date('nope')` is an Invalid Date and drizzle sends it anyway.
  Fixing the id alone would have left the timestamp 500ing. Neither shows up under
  the dev overlay; both were reproduced with `curl` against a production build.

  `src/lib/validation/cursor.ts` holds the contract, and `page.tsx`, `GET /api/ads`
  and `/moderation` all parse through it. **An unreadable cursor reads as no
  cursor, so the page renders its first page** — not a 404 (the URL is a valid
  listing carrying two junk parameters) and not a 500 (a Next page has no 400 to
  give). The cursor is a *position*, not a filter, and an unreadable position is the
  start. Only `AdGrid` writes those parameters, so this is a crawler or a
  hand-edited URL, not a visitor stranded mid-list.

  `components/MainColumn/MainColumn.tsx` carried an identical copy of the bug and is
  **not imported anywhere**. It was wired to the shared schema rather than deleted,
  so that wiring it up later does not resurrect the 500.
- **The moderation "all ads" list was capped at `PAGE_SIZE` with no pager, so of 200
  rows only 10 were reachable. Fixed 2026-10-03.** A moderator who could not find a
  scam had reached a *correct* conclusion from a truncated list, which is the worst
  kind of wrong. `getAllAds` now takes a cursor and returns `getAds`'s
  `{ items, hasMore, nextCursor }` shape; the two queries share one `olderThan`
  clause and one `toPage` helper rather than restating the pagination arithmetic.

  **Keyset, not `OFFSET`, deliberately:** a moderator deletes ads off this very
  list, and with an offset every row below a deleted one shifts up, so "page 3"
  quietly skips an ad nobody has looked at. A cursor names a position rather than a
  distance. The cost is that a keyset cursor cannot be decremented, so there is no
  "previous page" link — "Newest ads" returns to the start instead — and there are
  no page numbers, because "page 3 of 20" needs an offset or a `COUNT` and both
  make the number move under the moderator. Verified against the real table: the
  walk reaches all 200 ads exactly once across 20 pages.

  The page states where the moderator is, and claims completeness **only** when
  `hasMore` is false. An earlier honest-but-stale "Showing the most recent 10 ads"
  would still have read as "cut off" once a pager existed.
- **No account deletion.** Name, OAuth id and phone are stored with no erasure path.
  `deleteAdById` covers one ad, not the account.
- **No email contact channel**, which is also the only route to verifying that a
  poster controls the number they published.

### 9.5 Not on this list, deliberately

- **An admin UI** — still excluded. The moderation surface is two lists and three
  buttons; there is no user management, no content editing and no dashboard.
- **A second dialog component.** `ConfirmDialog` is the one, and that is enforced
  rather than remembered: `DeleteAdButton` once carried its own copy — `Alert.Root`,
  `Overlay`, `Content`, `Title`, `Description` and a second set of overlay
  keyframes, ~50 lines kept in step by hand. `DeleteAdButton.test.tsx` reads the
  source and fails if a second dialog is ever built alongside it, because "there is
  no duplicated dialog here" is an absence no rendered tree can distinguish from a
  dialog that has not been opened yet.
- **The dev/prod database split** — §3 explains why it is a deliberate choice and
  §8 covers the sharing. Real users appearing *is* the trigger to revisit, so it
  belongs on this list in spirit, but it is a database-provisioning task rather than
  an application change.
