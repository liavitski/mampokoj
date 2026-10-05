# HANDOFF

State of the repository, for a reader with no memory of the work.

**What this file is for:** the knowledge that cannot be re-derived from `git log`,
the code, or the README — mostly decisions that look like mistakes and traps that
cost real time. Everything else was cut. The `SPEC-*.md` and `todo.md` files that
used to sit alongside this one have been folded in and deleted; if you want the
history of a decision, `git log -S` finds it.

- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, **727 tests
  across 69 files**, `next build` succeeds. `pnpm test:e2e` adds **59 Playwright
  specs**, run by hand and not wired into CI.
- **Database:** one Neon database (`neondb`) shared by development *and* production.
  200 seeded ads, 398 images. Also holds 128 KB of abandoned tables from two older
  projects (§5). The UploadThing bucket is empty and agrees with the database.
- **Production is live** at `mampokoj.vercel.app` and the moderation queue works
  there. **Env vars are set in the Vercel dashboard by hand** (§1) — the item most
  likely to waste an afternoon.
- **Git:** `main` runs ahead of `origin/main` by several commits — check
  `git log origin/main..main`. This file does not name its own commit hash, and does
  not claim a clean tree on its own honour.

---

## 1. Environment facts that will otherwise waste your time

1. **`MODERATORS` lists OAuth account ids, not email addresses.** Read by
   `src/lib/moderator-guard.ts`; the value is the id in your own
   `/dashboard/<userId>` URL and the one `ads.userId` holds. **An email here never
   matches and the allowlist fails closed**, so the symptom is `/moderation`
   refusing forever with nothing in the logs — the single most confusing failure this
   app has. Deliberately not written down in this repo, which is public. **Set it per
   environment in the Vercel dashboard, by hand.** Vercel scopes env vars, so a
   Production-only value leaves Preview deployments refusing in exactly the same
   silent way. It is not a secret: it gates the *web* surface.
2. **Kill :3000 before any e2e run that follows a source change** (§3):
   `lsof -ti:3000 | xargs kill -9`, then `pnpm build && pnpm start`, then
   `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`. `pnpm verify` also rebuilds
   `.next`, which corrupts a running `next start`.
3. **Upstash Redis resolves from this machine and responds.** One remaining consumer,
   `ratelimit.ts`. **Do not assume it from a test** — the suite mocks Redis, and a
   mocked Redis proves nothing about a live one. If something Redis-backed looks
   broken, ping it first; the failure mode is silent.
4. **Postgres is reachable and `CREATE DATABASE` is permitted**, which is how
   migrations get verified rather than assumed. Two consequences: the connection
   string uses the **`-pooler` host**, so a scratch database cannot be dropped until
   its idle sessions are terminated (`SELECT pg_terminate_backend(pid) FROM
   pg_stat_activity WHERE datname = '<db>' AND pid <> pg_backend_pid()`); and `tsx`
   scripts importing `dotenv/config` must live **inside the repo** — from `/tmp` the
   module does not resolve.

---

## 2. Deliberately not doing

**Cache Components / Instant Navigation.** Decided against 2026-10-03. Not a config
flip — it would introduce this app's first cache layer, and four things stand in the
way:

1. **Two `Date.now()` calls are build errors under Cache Components**, and
   `instant = false` does not clear them (synchronous IO cannot be deferred):
   `src/lib/seo.tsx` in `adAvailability()`, which feeds the JSON-LD on
   `/ad/[adId]`, and the "x days ago" column in `src/app/moderation/page.tsx`.
2. **The theme cookie is read at the top of the root layout**, where no boundary can
   be put above it. Per `instant.md`, `instant = false` on the root layout disables
   static-shell validation for the *whole app* — the one segment that cannot be
   wrapped gates the feature for everything below it.
3. **Staleness collides with moderation.** Today a takedown is visible on the next
   request. Cached, `deleteAdAsModerator` leaves an ad's contact phone number on the
   page until `stale` expires unless all seven actions in `src/server/actions/`
   invalidate by tag. One missed tag is a taken-down scam ad still being served. The
   default cache is also per-instance in-memory, so on serverless there is no
   cross-instance invalidation guarantee at all.
4. **next-auth v4.** `getServerSession` reads the cookie deep inside itself, so it
   cannot be lifted into a plain `use cache`.

**No data caching either** (`'use cache'`, `unstable_cache`). This contradicts
`production-checklist.md:68`, and that is the right call: a marketplace where a
takedown must disappear immediately is the case where a stale read is a correctness
bug, not a slow page. **Do not let a future pass "fix" this.**

*Consequence to remember:* `cookies()` and `getCachedSession()` in the root layout
mean every HTML route is dynamic — `next build` reports `ƒ` for all nine. That is
the reason TTFB is a Neon round trip plus a JWT decode. A cost, not a defect, and the
price of the decision above.

---

## 3. Decisions that look like mistakes but are not

Each is deliberate and pinned by a test where a comment would not hold.

- **The CSP omits `upgrade-insecure-requests`, which every example in the Next.js
  docs includes.** It upgrades *subresource* requests, so on any `http://`
  deployment — including `next start` on `http://localhost:3000`, which is exactly
  what `E2E_BASE_URL` points at — every same-origin script and stylesheet would be
  requested over `https` and fail. HSTS covers production, and browsers ignore an
  HSTS header received over http. **Do not add it back without a protocol check.**
- **`style-src` keeps `'unsafe-inline'` while `script-src` does not, and
  `src/lib/registry.tsx` was left unplumbed.** Forced by three independent things,
  any one fatal: next-auth v4's sign-in page emits inline CSS and supports no nonce;
  `global-error.tsx` uses inline `style` objects by design (a document where
  styled-components is not mounted); and styled-components re-injects on the client.
  Because `'unsafe-inline'` is present a `style-src` nonce would be *ignored*
  anyway, so threading one in would add code and buy nothing.
- **`form-action` names `https://accounts.google.com`, and dropping it
  breaks Google sign-in with no symptom but a console line.** The proxy
  stamps the CSP on *every* response, including next-auth's answer to the
  sign-in form — `302 → accounts.google.com`. The browser enforces
  `form-action` against that redirect target, so `'self'` alone aborted
  the navigation to Google: the POST reached the server, the OAuth state
  cookies were set, and the visitor still sat on the sign-in page, which
  reads as "the button does nothing". Google is the one provider (§6), so
  this is the only cross-origin destination a form submission is ever
  redirected to; the origin is named, not wildcarded. The trap is that
  every check that does not click the real button stays green — the
  sign-in page renders, the button looks fine, and only
  `e2e/security-headers.spec.ts`'s "the Google sign-in form is not
  blocked by form-action" catches it.
- **The CSP keeps the UploadThing SSR plugin's inline script, and there is no
  `report-to`.** Removing the plugin would delete a global injection from every page
  and `@uploadthing/react` does fall back to a same-origin fetch — rejected because
  upload paths cannot be covered by this repo's e2e suite (every spec is anonymous
  and read-only), so the change would be unverifiable where it matters. The hash has a
  test instead. `Content-Security-Policy-Report-Only` needs an endpoint, and there is
  no reporting service in this project at all (`error.tsx` says so) — report-only
  without a collector is a header that looks like monitoring and is not.
  `experimental.sri` was also rejected: App Router only, and it addresses *external*
  script integrity, while the only external scripts here are Next's own, already
  covered by the nonce. `navigate-to` is unimplemented in Chrome and would not have
  covered the Google OAuth hop anyway.
- **`upload-guard.ts` fails closed.** It awaits `ratelimit.limit()` with no
  `try/catch`, so an unreachable Redis breaks uploads. A quota is not an authorization
  boundary, so failing open turns an outage into an abuse window — **the mechanism is
  the control.**
- **The moderator allowlist fails closed**, the opposite trade and equally
  deliberate: unset, empty or malformed means nobody moderates, because an open
  allowlist means a takedown button anyone can press.
- **One database for dev and production.** Found, not designed: Vercel's
  `DATABASE_URL` points at the dev database. Kept, because with no real users
  production keeps demonstrating itself. **Do not "create a second database" as a
  fix.** Real users appearing is the trigger to revisit — not the Free plan, which
  allows 100 projects and where this database uses under 9 MB of 1 GB. The
  `SEED_ALLOW` guard covers CI and a fresh clone but **not** production, since env
  vars are set by hand (§1).
- **The home page stays at `src/app/page.tsx`, and its `loading.tsx` lives in a
  `(browse)` group rather than beside it.** The obvious arrangement was long believed
  to break the intercepting modal, because `@modal/(.)ad/[adId]` resolves `(.)` by
  route-segment level. Measured against 16.3.6: **it does not**. What the move does
  break is `tsc` — the generated route types and two tests import `@/app/page` by
  path, so `pnpm verify` refuses the rearrangement. The type-checker, not an e2e test,
  is the guard. The group exists for the 404 status (§6).
- **No `/region/[code]` routes.** Region filtering is `?region=`, canonicalised in
  place. The rationale once given for a parallel hierarchy (that a new path segment
  stops the ad modal opening) was measured and is **false**: the modal intercepts from
  it and the grid stays mounted behind the dialog.
- **`getReportedAds` and `getAllAds` select `contactPhone` and `userId`, which every
  public query withholds.** A scam is recognised by the number, and taking an ad down
  means knowing whose ad it is. This is the only place a contact number renders
  unblurred, and it sits behind the allowlist check, which runs **before** the query —
  checked after, the data is already read and the refusal is cosmetic.
- **Reconciliation deletes orphans but never dangling rows.** That asymmetry is the
  whole design: a missing file does not prove the row is unwanted, and deleting one
  destroys user data where keeping it costs a broken thumbnail. **Do not "complete"
  it.** Seeded rows are excluded from the report because their `seeded-<uuid>` keys
  never existed in the bucket — without that rule the script reports all 398 seeded
  rows as damage, and since dev and production share a database, acting on that would
  delete a hundred listings' worth of rows. If the seed key format changes, this
  prefix has to change with it.
- **There is no `SessionProvider`.** `AuthButton` was the last `useSession()` caller;
  it takes the session as a prop, so the header is correct in the SSR HTML instead of
  rendering a spinner and popping into place on every navigation. If you add a caller
  that needs it, add the provider back with it.
- **The 404 *status* is the only thing producing `noindex` on the not-found page.**
  Next emits the tag automatically; declaring `robots` too produced two conflicting
  tags.
- **A client function passed to `<form action>` gets no pending state, so neither ad
  form guards its submit button any other way.** Both used to hand-roll `useState` and
  disable on it; that never worked, because the handler is not run inside a
  transition, so the update was not flushed until the action settled — by which point
  it was false again. The duplicate write was invisible from the response, which is why
  it survived. **Do not reintroduce a `useState` flag**, and note that disabling the
  button alone is insufficient — Enter in a text field is implicit submission.
- **A submission failure is rendered in the form, not toasted**, with `role="alert"`
  directly above the submit button rather than at the top of a scrollable modal where
  it can be off-screen. A toast vanishes in seconds while the form says nothing, so
  the visitor's only lasting record of a refusal was one they had stopped looking at.
- **The ad forms are not progressively enhanced, and that is accepted.** `curl` of
  `/dashboard/[userId]` returns zero `<form>` elements, because `Modal` renders
  children only once a click sets `open`. Posture is "read and navigate without JS,
  write with JS", which suits an authenticated page that is `noindex`. **A no-JS
  version would still be incomplete** — Radix `Select` needs JavaScript to open, so
  `region` would have no usable control.
- **The header's controls share one box model because there is only one.**
  `HeaderControl.tsx` owns the styling; picking the wrong wrapper is a visible
  regression, so `Header.test.tsx` asserts which each got.
- **The image routes declare no `images` in `generateMetadata`**, which makes the file
  convention the sole authority for `og:image` in both dev and production. **Do not
  "restore the photo alongside the card"** — see the environment split in §4.
- **A reported ad is never auto-hidden, blurred or deprioritised**, and there is no
  re-report/un-report: once flagged, an ad stays flagged until it is deleted. If the
  queue ever needs dismissing without deletion that is a `dismissedAt` column,
  deliberately absent. **Never** publish `reportedAt`, `userId` or `contactPhone` to
  the public payload, and **never** express "moderator" as a role column, a
  permissions table or a second auth provider.

---

## 4. Traps

Each of these cost real time.

- **A metadata route is static by default, so a `sitemap.ts` that queries the database
  makes `next build` require one.** `/sitemap.xml` was `○` in the build output, so the
  build prerendered it and called `getIndexableAds`. Locally that worked against the
  real `DATABASE_URL`; in CI it died with `Failed to parse URL from
  https://api.0.0.1/sql` — the Neon driver rewriting the unroutable `127.0.0.1`
  placeholder into a host it could not resolve. The commit had never been through a
  green CI run, so nothing local could have caught it. The fix is
  `export const dynamic = 'force-dynamic'`, which is also the honest behaviour: a
  build-time sitemap freezes the ad list, so ads created or taken down between
  deploys never appear and removed ones keep being advertised. **After this, every
  route that renders on a request is `ƒ`; `/robots.txt` and `/opengraph-image` are the
  only prerendered ones and the only two that read no database. Adding a third static
  route that queries breaks the build.** `ci.yml` says this where the placeholder is
  set.
- **`pnpm typecheck` is green locally and red in CI, because `PageProps` and
  `Route` do not exist until something generates them.** `.next/` and
  `next-env.d.ts` are both gitignored, so a fresh clone has no
  `.next/types/routes.d.ts`, and `tsc --noEmit` on its own then fails with
  `TS2304: Cannot find name 'PageProps'` in every route file. A dev server or a
  prior `next build` leaves that directory populated, which is why
  `pnpm verify` passed on the machine that wrote the code and the commit went
  red on arrival. The fix is in `package.json`: `typecheck` is
  `next typegen && tsc --noEmit`, the command that emits the route types
  without a full build (`next` CLI docs, `next typegen` — "useful for IDE
  autocomplete and CI type-checking"). `src/__tests__/typed-routes.test.ts`
  asserts that exact script string, because the failure mode is *ordering* and no
  test that runs after the fact can see it. Note the same applies to
  `next-env.d.ts`, which `next typegen` also writes and which `tsconfig.json`
  includes — a missing file there fails differently.

- **`pnpm test:e2e` silently tests a stale build.** `reuseExistingServer: true` reuses
  whatever is on :3000 **without checking it matches the working tree**. Mutate
  `next.config.ts`, `src/proxy.ts` or `src/lib/csp.ts` and the suite will cheerfully
  assert against the previous build's behaviour, which reads as a passing test and is
  the opposite. This produced 11 convincing failures against correct code.
- **A script injected through the DevTools protocol bypasses CSP entirely.** Chrome
  treats CDP `Runtime.evaluate` and `addScriptTag` as trusted script creators, so
  `page.evaluate(() => { ...createElement('script')... })` reports success while
  testing nothing. To test that an injection is blocked, put the script in the
  *markup* by intercepting the response. Relatedly, a `securitypolicyviolation` is
  the only evidence a hash-based entry works, and the obvious assertion cannot fail:
  UploadThing's SSR plugin assigns `globalThis.__UPLOADTHING` *during render* too, so
  the load-bearing assertion is the **absence** of a violation.
- **Any module calling `styled.*` or `createGlobalStyle` needs `'use client'`.** A
  styled component in a Server Component generates its rule during the RSC pass, where
  it lands in the flight payload and is never emitted — nothing recovers it, because a
  Server Component does not re-render on the client. `StyledComponentsRegistry` does
  not help; its `StyleSheetManager` only wraps the client pass. An `async` Server
  Component cannot hold the directive, so those keep their styled definitions in a
  sibling `*.styles.tsx` that does. `src/__tests__/styled-components-boundary.test.ts`
  fails if you move one back. **To check by hand:** `curl` a route, collect the class
  names, confirm each appears in a `<style>` element or linked stylesheet. A class
  appearing only inside a `<script>` is dead CSS. Global rules live in
  `src/app/globals.css` — same failure one level up, but a stylesheet linked from
  `<head>` needs no boundary.
- **A custom property that resolves to nothing is silent.** For an inherited property
  the declaration is invalid at computed-value time and the element keeps its parent's
  value. `src/__tests__/tokens.test.ts` fails on this.
- **Which `og:image` wins depends on the environment, and the docs describe only one
  of them.** With an ad's photo in `generateMetadata.openGraph.images` *and* an
  `opengraph-image.tsx` in the same segment, one commit, two answers: `pnpm dev`
  emits **the photo and no card at all**; a production build emits **the card and
  drops the photo**. `generate-metadata.md` ("file-based metadata has the higher
  priority") describes the build. So a card verified only against dev can look right
  and be absent in production. **Measure image and metadata work against a production
  build** — this repo has now been bitten by that twice.
- **Handing satori a URL it cannot read 500s the whole image route** (`Unsupported
  image type`, then `Image size cannot be determined`). A mime it does not know is
  *not* an error there: it draws a filled block where the photo should be, worse than
  no photo because it looks deliberate. Hence `src/lib/og-photo.ts` — fetch the bytes,
  take the mime from the bytes, fall back to a text-only card. Relatedly, an
  **invalid** colour throws `Failed to parse declaration`, so every colour in those
  files has to be real; `hsl()` itself works and byte-identical output to its hex
  equivalent is why the cards use the app's own `LIGHT_TOKENS` rather than literals.
- **The neon HTTP tagged template binds *everything*.** Any interpolation becomes a
  `$1` parameter, so an identifier or array passed through it yields `INSERT INTO $1`.
  Use `sql.query('... VALUES ($1,$2)', [a, b])` when a statement needs both a literal
  table name and bound values. Relatedly, **`client.unsafe()` is a fragment, not a
  query executor** — awaited on its own it returns the SQL it was handed, having run
  nothing, so `CREATE DATABASE` and the next statement both look fine while the
  database was never created.
- **A unique violation does not arrive where you look.** Drizzle wraps driver errors,
  so 23505 reaches you as a `DrizzleQueryError` with `code: undefined`; the real
  `NeonDbError` is on **`.cause`**.
- **`Redis.fromEnv()` does not throw when the variables are missing** — it warns and
  returns a client that fails on every call. Set the variables in `vi.hoisted`, before
  the import runs. Separately, the client's `signal` is a factory evaluated per
  request, so `retries: N` multiplies the effective timeout by `retries + 1`; that is
  why `redis.ts` keeps those settings private.
- **`getTableConfig(table).columns` is an array** on drizzle-orm 0.45, not a
  name-keyed record. `Object.keys()` over it yields `'0'`, `'1'`, … and a test built on
  that asserts nothing while looking correct.
- **`tsx` compiles to CJS here** (no `"type": "module"`), so top-level `await` fails
  in a scratch script — wrap it in an async function. **`server-only` is an alias Next
  provides**, not a package that resolves on its own, so any `tsx` script importing a
  `server-only` module fails `MODULE_NOT_FOUND` unless passed
  `--conditions=react-server`.
- **`drizzle-kit migrate` exits non-zero on failure but prints nothing about what
  failed.** Diagnose by running the SQL by hand.
- **`utapi.listFiles` is paginated, and a partial read looks like a bucket full of
  orphans.** Page until `hasMore` is false; without that, `--delete` would remove live
  photos.
- **A schema change and the database are one deploy, not two.** `schema.ts` is what
  the running app compiles against and development uses the shared database, so
  committing a column without running `db:migrate` breaks the app immediately. Adding
  `reportedAt` did exactly this: the dashboard threw `column "reportedAt" does not
  exist` and every report failed behind a generic toast — two symptoms, one cause, and
  the second invisible because the action's `catch` swallowed the driver error.
  **`getUserAds` is the canary, deliberately:** it selects the whole row, so it breaks
  first and *loudly*. Narrowing it to an explicit column list would make a missing
  column silent. Verifying a migration on a scratch database proves the SQL; it does
  **not** mean the shared database has it.
- **`db:migrate` can be a silent no-op, because the migration ledger is not prefixed.**
  See §5.
- **Excess-property checking does not reach through `flatMap` inference.** A seed
  builder set a column that does not exist and `tsc` was silent; the insert succeeded
  anyway. The seed tests compare against `getTableColumns` for this reason.
- **`Modal` is one box split across two files.** `Content` and `AdCardCompact`'s
  `Wrapper` share it through a `data-modal-box` attribute — set in `Modal.tsx`,
  selected in `AdCardCompact.styles.tsx`. Rename it in one without the other and the
  dialog draws a card within a card.
- **An awaited server action with no `catch` disables its button forever.**
  `useTransition`'s `isPending` is only cleared when the transition *finishes*, so a
  rejected action that is never caught skips the reset on every path. The button goes
  dead and nothing says why. `try`/`catch`/`finally`, with `finally` doing the reset.
- **React resets a form whose `action` is a function** (`recursivelyResetForms`), so
  **every field is cleared after a submission, success or failure.** Not a regression,
  but "keep what the user typed after a failure" does not hold here, and it costs most
  in the update form whose pre-filled database defaults are now gone. Preserving them
  means making every field controlled. The reset also lands **asynchronously**, after
  the promise resolves, so a test that refills the form straight after a submit
  appends to values still present ("A roomA room") and then fails `maxLength` — which
  reads as "the button does nothing".
- **An action left in flight when a test ends resolves during whichever test runs
  next**, against an unmounted component, and lands its `showToast`/`router.push`
  calls in the *following* test's mocks. Three tests failed this way while passing
  alone. Release and await, in a `finally` where possible.
- **A `:hover` or other pseudo-class rule cannot be verified by a rendering test**,
  because the rendering is identical whether or not it fires. Moving the card's hover
  zoom from the card onto the image strip left 727 tests green and the effect dead over
  most of the card; only hovering a real card in Chrome and comparing
  `matches(':hover')` against the computed style caught it. Same class of trap as a
  build that renders fine and does nothing.
- **This machine's `~/.npmrc` sets `min-release-age=3` days** (pnpm surfaces it as
  `minimumReleaseAge`). A *machine* supply-chain guard, not a repo setting — do not
  disable it. The effect is that `next` lags npm by up to three days, so a version
  being installable is not evidence it is the newest.

Component-test specifics: `AdGrid` and `AdPhotosGallery` need `vi.mock` for
`next/navigation` and `../ToastProvider`; `RegionSelectBlock` is `display: none`
under jsdom, so queries need `{ hidden: true }`; Radix `Select` will not open its
portal in jsdom while the trigger is hidden, which is why the region filter is covered
by `e2e/region-filter.spec.ts` and not a component test.

---

## 5. Testing conventions

The recurring lesson of this repo's testing history: **a test that cannot fail is
worse than no test**, because it is read as proof.

**A live call that succeeds against an empty target is not a verification.** The call
ran, returned no error, and proved nothing — a wrong key does not error either.
Before recording any check as verified, confirm the thing it asserts *could* have
failed. Measuring the precondition is part of the check, not a detour from it. (The
first attempt at verifying `utapi.deleteFiles` passed against a bucket holding 0
files.)

- **Never assert against gitignored local state — a test that reads `.env` is
  green here and red on every CI run, and the two are asserting different facts.**
  `env-check.test.ts` had a baseline case that spawned the checker and required
  exit 0, which was only satisfiable by the developer's own `.env`. CI has none,
  so that case — and one other — failed on all five runs since it was written
  while the typecheck failure above masked it. Supply the environment from a
  constant in the test file, and assert that constant's keys against the
  checker's own list, because `dotenv` silently fills any gap: dropping one
  variable keeps every case green locally and only turns red in CI. Relatedly,
  **masked failures hide each other** — CI stopped at the typecheck error, so a
  second independent red sat behind it unnoticed for a day. Read the log from the
  first failing step, not the last one.
- **Revert the fix and confirm it fails before believing a test proves something.**
  `expect(mocks.x).toHaveBeenCalled()` proves nothing.
- **Assert on what the code under test produced, not on what the test produced.**
- **If a constant cannot influence the assertion, the assertion is decorative.**
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even when the
  check is removed.
- **Restore a spy only after asserting on it.** `mockRestore()` also resets
  `mock.calls`.
- **Say what a test catches, not what you hope it catches.**
- **A reviewer's finding is data, not a verdict.** Several confidently asserted
  findings in this repo's history were wrong.
- **Never write an unscoped `db.delete`** next to a real database. Prefer no delete:
  seeding is additive, so restoring is `pnpm db:seed` again. If a delete is
  unavoidable, scope it by a known test marker — **never by a timestamp**, because a
  seeded batch shares one `createdAt` and any cutoff computed from the data is the
  same fact as the data.

Server-side test files start with `// @vitest-environment node` (the default is
jsdom). Tests live in `__tests__` folders beside the code.

**jsdom enforces native constraint validation**, so a submit through a button does
nothing at all while a `required` field is empty — the action is never called, and the
failure looks like "the button does nothing". `RegionSelect`'s hidden `<select>` is
*not* `required`, so an unset region does not block a test; the server rejects it.

**In a component test of a Radix `Modal`, scope queries with
`within(screen.getByRole('dialog'))`.** Unscoped, `getAllByRole('button', …)` matches
the trigger *and* the submit, and `findByText` collides with the same string printed
outside the modal — "Maximum 2 ads per user" is both the create button's caption and
`createAd`'s refusal message. Both collisions read like bugs in the form and are not.
The submit button is the **last** match once open.

**jsdom does not evaluate `@media`**, so a responsive CSS bug is invisible to a
component test. `Header.test.tsx` asserts both halves for that reason: a
`getByRole(name)` check, which proves a control is named *as rendered*, and a
`document.styleSheets` check, which proves the name survives the phone breakpoint.

**And jsdom does not evaluate `prefers-reduced-motion` either.** The Chrome DevTools
MCP `emulate` tool has no reduced-motion option; use Playwright's
`reducedMotion: 'reduce'` context option.

---

## 6. Database and migrations

`drizzle/` is committed (`0000`…`0003`). CI runs `db:generate` and fails if it
produces a diff, so a schema change cannot reach production without its migration.
`generate` compares `schema.ts` against `drizzle/meta/_journal.json`, not a live
database, so a create-from-zero baseline falls out of an empty `drizzle/` offline. No
scratch database is needed to *write* a migration, only to verify one.

The shared database is **baselined** — `0000_init` and `0001_breezy_warstar` are in
`drizzle.__drizzle_migrations`, so `db:migrate` runs normally and there is no
`db:baseline` step in any release.

**The ad limit is a database invariant, not application logic.** `ads` carries a
`slot smallint` with a unique index on `(userId, slot)`. `createAd` walks the slots
from 0 and inserts into the first one nobody holds, reading the 23505 off
`error.cause` and treating it as "this slot is taken" rather than as a failure. A user
at the limit holds every slot, so the cap is Postgres refusing a duplicate pair — with
no transaction and no Redis. Every alternative was measured first: `db.transaction`
throws on the neon-http driver, `pg_advisory_xact_lock` cannot help under READ
COMMITTED, a trigger runs inside the INSERT's own snapshot, and a partial unique index
can only say "at most 1". An advisory lock *was* a fourth option and is deleted —
`src/server/__tests__/retired-user-lock.test.ts` is the tripwire, because a lock
working correctly alongside the index would pass every behavioural assertion there is.

Invariants a change here must preserve, each asserted somewhere: the unique pair stays
**unique and over exactly `(userId, slot)`** (`migrations.test.ts` asserts it in both
the schema and the migration SQL); a 23505 on this insert means "slot taken", and the
only other unique constraint is the random primary key, so discriminate on
`error.cause.constraint` rather than the code alone if a second is ever added; `slot`
is **not public** (`PublicAd`'s `Omit`, asserted by `ad-dto.test.ts`, and a new column
arrives through `InferSelectModel` and breaks `tsc` until someone decides otherwise).

Verified against the real database, not merely asserted: 20 simultaneous
`insertIntoFreeSlot` calls for one throwaway user id yield exactly 2 rows and 18
refusals — 11 consecutive runs, always exactly 2. **The cost of one provider, stated
rather than buried:** the slot keys on the OAuth account id, so a person signing in
with both GitHub and Google used to hold 4 ads. There is now one provider, pinned to
length 1 by a test, and anyone who only ever signed in with GitHub can no longer sign
in. With one real account that is a deliberate trade.

**This database holds leftovers from two abandoned projects.** `neondb` is shared
across several of this owner's projects by choice, and the `mampokoj_` prefix keeps
them apart. Four tables in `public` are **not** this repo's — `users`, `customers`,
`invoices`, `revenue` (1/6/11/12 rows, a tutorial project) — plus an empty `roomFinder`
schema. They are residue, not live neighbours: no foreign keys to anything, 128 KB
against a 1 GB per-project Free allowance. **Do not write a migration that drops
them.** They are not this repo's to delete, and a migration is permanent while a
manual `DROP TABLE` is one command you can see first.

Isolation is by table prefix and it holds: `pgTableCreator` renames every table to
`mampokoj_*` and `drizzle.config.tsx` sets `tablesFilter: ['mampokoj_*']`, applied when
drizzle-kit introspects the live database — which is why **`pnpm db:push` is safe
here**. **The one gap: `drizzle.__drizzle_migrations` is a single unprefixed table**
named by library default, and the migrator decides what to run from **only the newest
row** (`order by created_at desc limit 1`). A newer row written by any other drizzle
project here would make `db:migrate` skip everything in this repo — silently, no
error. That cannot happen today (measured: one migration table, this repo's four rows,
and the abandoned projects never ran the migrator). The gap becomes real the moment a
*new* project starts using drizzle against this database, which is when to set
`migrationsSchema: 'mampokoj_drizzle'` in `drizzle.config.tsx` **and** the matching
`MIGRATIONS_SCHEMA` in `src/utils/baseline.tsx`, before its first migration.

---

## 7. Bundle size

Baseline as of 2026-10-04, production build on `next start`: **home page 217 KB of
JS across 18 files** (was 258 KB across 19 before `motion` was removed), ad page
213 KB. About 59% of that is the `next` runtime and 62 KB of it is
`react-dom-client` alone — the app's own source is ~11 KB. `next build` reports no
per-route client sizes; these were measured.

**Two traps in measuring it.** First, **do not sum every `<script src>` in the
HTML** — that over-counts by ~40 KB, because `polyfill-nomodule.js` (39,627 bytes
gzipped) is emitted with `noModule=""` and **no modern browser downloads it**. Sum
what a browser actually fetched, from a cold context. Second, **`pnpm dev` is not a
valid baseline** for anything bundle-shaped; use a production build, as with the
image metadata above.

**To re-analyse:** `pnpm next experimental-analyze --output` writes a diffable
snapshot to `.next/diagnostics/analyze`. **`@next/bundle-analyzer` is a webpack
plugin and does not apply** — this build is Turbopack, for which the CLI analyzer is
the supported tool. `analyze.data` is a binary container with JSON sections at byte
offsets, not a JSON file; extract by brace-matching from the first `{"sources"`.
Note that its per-module totals sum each module's largest appearance across *all*
client chunks, which measures the whole app rather than one route's download — do
not quote that number as a saving estimate. Quote the re-measured route figure.

**`motion` was removed over 41 KB** — 15.9% of initial JS — for a region-nav pill
that slid between links on hover and a 1.05 card-image zoom, both of which are CSS
now. `motion-dom` (41 KB, the projection engine) was 84% of that and existed solely
for `layoutId`. It is not to be reinstalled for the pill; §4 explains why the two
changes are load-bearing on each other.

---

## 8. Taking real users: what stands between this and a live site

The app runs and the authorization core is solid — ownership is settled in the query
predicate rather than after the read, and the public payload is allowlisted twice.
That part needs no work. What follows is what changes when the users are real
landlords rather than seeded rows.

**Resolved by decision, so not work:**

- **Any signed-in visitor may see a listing's phone.** `getValidatedAd` selects the
  whole row and both cards render the number for any signed-in visitor, blurred until
  clicked. The gate is "signed in", not "is the poster". The blur is a courtesy
  against shoulder-surfing, **not a security boundary** — the digits are in the HTML
  for every signed-in visitor.
- **Redis is out of the create path entirely.** The advisory `withUserLock` that used
  to wrap `createAd` is deleted along with ~800 lines of lock tests: it was correct
  and still not worth its price. There is no *rate* limit on `createAd` and there does
  not need to be — a hard cap of two refuses the third however fast it arrives.
  `checkUploadAdmission`'s ratelimit stays, because there the abuse is bandwidth rather
  than row count.
- **Reporting, moderation and takedown all work**, verified in a real browser with a
  live Google sign-in: the queue lists, row order matches `getReportedAds` against the
  database, the anonymous path refuses, and a takedown and an owner delete each leave
  `/ad/[adId]` answering 404. `teardownAd` genuinely removes files from the bucket.
  Reported ads **stay visible**, since hiding them hands any signed-in account a
  one-click DoS against any ad id. Two deviations worth keeping: `ReportButton`'s
  disabled "Reported" state is **session-local** and resets on reload, because
  `reportedAt` is withheld from every public payload; and GitHub sign-in was removed
  once the maintainer's account id was known.

**Worth doing, not blocking:**

- **A missing ad answers 404, and it does — keep it that way.** `notFound()` in a
  route with a Suspense boundary above it answers 200 instead, because the response
  head is committed before the page's data runs. The boundary therefore lives in the
  `(browse)` group. If it ever comes back to the root the page silently becomes 200
  *and* indexable; `noindex-private-routes.test.ts` asserts no root `loading.tsx`
  exists for exactly that reason.
- **An unreadable cursor renders the first page and never 500s.** There were **two**
  bugs, not one: `?cursorId=not-a-uuid` and `?cursorCreatedAt=not-a-date` threw
  separately, because `new Date('nope')` is an Invalid Date and drizzle sends it
  anyway. `src/lib/validation/cursor.ts` holds the contract and all three readers
  parse through it. An unreadable cursor reads as no cursor — not a 404 (the URL is a
  valid listing carrying two junk parameters) and not a 500 (a Next page has no 400).
  `components/MainColumn/MainColumn.tsx` carried an identical copy of the bug and is
  **not imported anywhere**; it was wired to the shared schema rather than deleted.
- **The moderation "all ads" list reaches all 200 rows**, via keyset paging and
  deliberately **not** `OFFSET` — a moderator deletes ads off this very list, and with
  an offset every row below a deleted one shifts up, so "page 3" quietly skips an ad
  nobody has looked at. The cost is no "previous page" link ("Newest ads" returns to
  the start instead) and no page numbers. Verified against the real table.
- **No account deletion.** Name, OAuth id and phone are stored with no erasure path.
  `deleteAdById` covers one ad, not the account.
- **No email contact channel**, which is also the only route to verifying that a
  poster controls the number they published.

**Not on this list, deliberately:** an admin UI (the moderation surface is two lists
and three buttons); a second dialog component (`ConfirmDialog` is the one, enforced by
`DeleteAdButton.test.tsx` reading the source, because "there is no duplicated dialog
here" is an absence no rendered tree can distinguish from one not yet opened); and the
dev/prod database split, which is database provisioning rather than an application
change.