# todo.md — aligning the app with the Next.js 16.3.6 docs

Written 2026-10-03 against the docs shipped in `node_modules/next/dist/docs/`
(Next.js 16.3.6), not against training data. Every item cites the guide it comes
from, because this version's conventions differ from what most write-ups say.

**Out of scope by decision:** Cache Components and Instant Navigation
(`cacheComponents`, `partialPrefetching`, the `instant` segment config). Not on
this list, and not to be added to it. The reasoning is recorded under
[Deliberately not doing](#deliberately-not-doing) so a future session does not
re-derive it.

**Status: items 1, 2, 3, 4 and 5 shipped** (1–3 on 2026-10-03: `6a95abe`,
`9d11164`, `4568b25`, all pushed; 4 on 2026-10-04: `f12ce61`, local;
5 on 2026-10-04: `46cd4db`, local).
Each is marked in place. Items 6–11 are open.

Worth knowing before continuing down the list: item 3 was filed as docs alignment
and was actually two live defects, including a submit button that had never been
disabled. **Read a component before assuming an entry describes a style problem.**

The order below is value-per-effort, not doc order. Items 1–5 are small and
independent of each other.

---

## 1. Error boundaries — no `error.tsx`, no `global-error.tsx` anywhere

**Docs:** [`production-checklist.md:45`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md)
("Gracefully handle catch-all errors … by creating custom error pages") and
`:87` ("Add `app/global-error.tsx`"). Mechanics in
[`error.md`](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).

**Now:** an uncaught throw in any of the four routes renders Next's built-in
error page — unstyled, English, no navigation. `find src/app -name "error*.tsx"`
returns nothing.

**Fix:** two client components, and only two.

- `src/app/error.tsx` — boundary for everything below the root layout: `/`,
  `/ad/[adId]`, `/dashboard/[userId]`, `/moderation`, `@modal`. The root layout
  stays mounted, so header, footer, theme and toasts survive the failure.
- `src/app/global-error.tsx` — for throws *inside* `src/app/layout.tsx` itself:
  the `cookies()` read, `getCachedSession()`, `next/font`, the UploadThing SSR
  plugin. It replaces the document, so it must render its own `<html>`/`<body>`.

Rules that matter, from `error.md`:

- Both need `'use client'`. An error boundary cannot be a server component, and
  for the same reason **neither file may export `metadata`** — use React
  `<title>` in `global-error.tsx` if a title is wanted there.
- `global-error.tsx` gets no global styles and no font from the build, so
  `data-color-theme` and the CSS variables written in `layout.tsx:47` do not
  reach it (`error.md:165` says this outright). Re-apply them: read `color-theme`
  from `document.cookie` in a small inline `<script>` and set the tokens on
  `document.documentElement` before paint, with `suppressHydrationWarning` on
  `<html>`. Do **not** do this in a `useState` initializer — a dark-mode cookie
  would then disagree with the server render and hydration would mismatch.
- Inline `style` objects in `global-error.tsx`, no `styled.*`: the
  `StyledComponentsRegistry` from the root layout is not mounted, so a styled
  rule would inject on the client with no SSR pass behind it. In `error.tsx`
  styled-components is fine — it is a client module and the registry is mounted.
- `src/constants.tsx` is pure data with zero imports, so `LIGHT_TOKENS` /
  `DARK_TOKENS` are safe to import from a client component.
- Do not import `next/font` into `global-error.tsx` (see item 9). A system font
  stack is the honest choice for a file that replaces the document.
- Log with `useEffect(() => console.error(error), [error])`, matching how the
  server actions already report. Use `retry`, not `reset`. Show `error.digest`
  only when present: in production a server-component error reaches the client
  with a generic message, and the digest is the only handle that ties a user's
  screenshot to a log line.

**Shipped 2026-10-03.** `src/app/error.tsx` and `src/app/global-error.tsx`, with
19 cases in `src/app/__tests__/error-fallbacks.test.tsx`.

Two things that turned out differently from the plan above:

- **No source-read invariant was needed, and would have been the weaker test.**
  Both files are rendered for real, and `global-error.tsx` through
  `renderToStaticMarkup` rather than `render()` — mounting a document into
  jsdom's `document.body` cannot express what the file *is*, and React 19 hoists
  `<title>` out to the real head, so a mounted assertion about either tag is
  really an assertion about jsdom. The markup string is what the server sends,
  and that is the thing that has to contain `<html>` and `<body>`.
- **The theme script is executed, not just asserted on.** It is a string, so it
  can look right in a snapshot and still do nothing — no type error, no failed
  assertion, a white page for every dark-mode visitor. It is extracted from the
  rendered markup and run against dark, light, absent, `'Dark'` and a hostile
  cookie value.

`error.tsx` may use styled-components (the root layout is still mounted);
`global-error.tsx` uses inline `style` objects, no `next/font`, and no `<link>` —
it replaces the document, and a hashed asset URL is a guess in a build that has
already failed. Its body colours are literals from `LIGHT_TOKENS` rather than
`var(--color-background)`, because the script defining that variable has not run
when React builds the markup; a `var()` there would paint white and cause the
exact flash the script exists to prevent.

**Not verified in a browser.** The manual check below was planned and has not
been done — there is no rendering of either boundary against a real document yet,
so the theme script has been proven to parse and to write the right tokens in
jsdom, not that it beats first paint in Chrome.

**Still open, deliberately:** no reporting service, so `console.error` remains
the whole of the error report. A `digest` is shown to the visitor, which is the
only handle tying their screenshot to a Vercel log line.

**Effort:** S.

---

## 2. `<Link>` bypassed on the primary navigation

**Docs:** [`production-checklist.md:44`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md)
— use `<Link>` for client-side navigation and prefetching.

**Now:** `src/components/RegionNavigation/RegionNavigation.tsx:49` renders a
`<Link>` and then intercepts the click:

```tsx
onClick={(e) => {
  if (isPending) return;
  e.preventDefault();
  startTransition(() => { router.push(href); });
}}
```

The `startTransition` is there to drive the `$pending` style. Two consequences:
it is not the documented pattern, and **cmd/ctrl-click and middle-click no longer
open a region in a new tab**, because there is no modifier check before
`preventDefault()`. A user who wants to compare two regions in two tabs cannot.

**Fix (shipped 2026-10-03):** the handler now bails unless the click is a plain
left one — `e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey`. A
declined click falls through to `<Link>`, whose own `isModifiedEvent` check
declines it too, and the browser follows the `href`.

Kept `router.push` rather than switching to the documented `useLinkStatus`,
which would have removed the handler altogether: it reports no pending state once
the destination is prefetched, and fourteen links pointing at one dynamic route
makes prefetched the common case — so the `wait` cursor would mostly never
appear. Revisit if the region pages ever get a `loading.tsx` worth showing.

`src/components/RegionSelectBlock/RegionSelectBlock.tsx:21` also uses
`router.push`, but that one is correct: it is a Radix `Select.Item`, which is a
button, not a link.

**Tests:** nine cases in
`src/components/RegionNavigation/__tests__/RegionNavigation.test.tsx`. The four
modified gestures are `it.each`-parameterised, because a guard checking only
`metaKey`/`ctrlKey` would leave middle click broken and each needs to fail
independently. One asserts the declined click's `preventDefault` is *not* called
— without that, the click dies instead of opening a tab. Dispatched with
`fireEvent` rather than `userEvent`, since user-event's `[MouseMiddle]` produces
no `click` event in jsdom and the case would pass without the handler running.

**Effort:** S.

---

## 3. Forms bypass `useActionState`

**Docs:** [`10-error-handling.md`](node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md)
("use the `useActionState` hook to handle expected errors") and
`07-mutating-data.md`.

**Now:** `src/components/RoomListingForm/RoomListingForm.tsx:57` and
`src/components/UpdateRoomListingForm/UpdateRoomListingForm.tsx:75` pass a
*client* function to `<form action={...}>`. That function calls the server
action and hand-rolls pending state with `React.useState`. Consequences: no
`useFormStatus` integration, the pending state cannot be derived from the
transition, and **the form is not progressively enhanced** — with JavaScript
unavailable or failed, submission does nothing instead of posting.

**Shipped 2026-10-03**, both forms. 27 cases across
`src/components/RoomListingForm/__tests__/RoomListingForm.test.tsx` and
`src/components/UpdateRoomListingForm/__tests__/UpdateRoomListingForm.test.tsx`.
The action signatures did not change, so the existing action tests are untouched.

Two real defects surfaced rather than the docs-alignment this was filed as:

- **`disabled={isPending}` never applied.** A *client* function passed to
  `<form action>` is not run inside a transition, so `setIsPending(true)` on the
  first line of the handler was not flushed until the action settled — by which
  point the handler had set it back to false. The button stayed enabled for the
  whole request. Reachable without touching it: Enter in a text field is implicit
  submission, which a disabled button does not block. For `createAd` the slot
  loop absorbed the duplicate into the next free slot, so two submissions
  quietly consumed two of the user's allowance and both reported success; for
  `updateAd` there is no such guard and it was two `UPDATE`s of one row.
  `useActionState`'s `pending` comes from React's action queue rather than
  component state, so the identical `disabled` prop works there.
- **A refusal was a toast and nothing else.** It vanished in seconds, and the
  form said nothing. Now `state.error` renders above the submit button with
  `role="alert"`, and the failure toast is gone rather than duplicated.

Two things the write-up above did not anticipate:

- **Progressive enhancement is still not achieved, and cannot be while the form
  lives in a modal.** Verified: `curl` of `/dashboard/[userId]` returns zero
  `<form>` elements, because `Modal` only renders its children once `open` is set
  by a click. `<form action={formAction}>` is now the shape that *could* post
  without JavaScript, and both files say so. Getting the actual guarantee means
  a create/edit route that renders the form server-side — a product decision, not
  a refactor.
- **The fields are cleared after any submission.** React resets a form whose
  `action` is a function (`recursivelyResetForms`), so "keep what the user typed
  after a failure" does not hold here. Confirmed against the pre-change code,
  which cleared them identically. Preserving them means making every field
  controlled. Asserted as-is so the behaviour is documented rather than
  rediscovered.

`aria-busy` on the button rather than a "Creating ad…" label, so the accessible
name does not change mid-interaction. Verified in a browser with a
temporarily-gated forced failure: `disabled` true and `aria-busy="true"` during
the request, label unchanged, then the alert rendered inside the dialog with the
form scrolled to it.

Also note `useActionState` holds the previous state until the new action
resolves, so a retry would otherwise leave the last refusal on screen for the
whole request — hence `state.error && !pending`.

**Effort:** S per form, as estimated.

**Progressive enhancement: decided not to pursue.** The `action` prop is now the
shape that *could* post without JavaScript, but the guarantee is unreachable while
the form lives in a `Modal` — `curl /dashboard/[userId]` returns zero `<form>`
elements, because the children render only once a click sets `open`. Getting it
would mean a server-rendered create/edit route.

Declined, on the reasoning that the site's posture is "read and navigate without
JavaScript, write with JavaScript" — reasonable for an authenticated page that is
`noindex` and disallowed in `robots.txt`. The failure being protected against is
really a *partial* one (a chunk 404s, the bundle hangs), and for that the in-form
error message above is the real protection, not a no-JS POST path.

Two costs worth knowing if this is ever reopened: a dedicated route trades the
modal's context (the ad list stays visible while you fill the form) for a narrow
gain, and **Radix `Select` needs JavaScript to open**, so `region` would have no
usable control in a no-JS version — a native `<select>` fallback is needed for the
guarantee to be complete, not just a new route.

Revisit only with evidence about how often JavaScript actually fails for real
users (a `vite:preloadError` listener, or Next's error telemetry). Absent that,
this is a documented gap, not work.

---

## 4. `useSearchParams()` for a value the server already has

**Docs:** [`production-checklist.md:47`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md)
— be deliberate about request-time APIs; pass values down where you already
have them.

**Now:** `src/app/page.tsx:71` destructures `region` from `searchParams`, then
`src/components/AdGrid/AdGrid.tsx:28` calls `useSearchParams()` to read the
same `region` again, only to append it to the load-more request.

**Fix:** pass `region` as a prop from the page and drop the hook. This also
removes the one client hook in the tree that would force a `<Suspense>` boundary
under Cache Components — irrelevant today, but it is the reason the hook is
worth removing rather than leaving.

**Shipped 2026-10-04** (`f12ce61`). `AdGrid` takes `region?: string` and the
page passes its validated `region` down (an invalid region returns before
`AdGrid` renders, so the prop is `undefined` or a real code); `MainColumn`,
the other call site, passes its own prop through. Seven cases in
`src/components/AdGrid/__tests__/AdGrid.test.tsx` — the `next/navigation`
mock went with the hook, and two new cases pin the contract: the load-more
request carries `region=PR` when given a region, and omits `region=` when
not. The comment at `e2e/load-more.spec.ts:212` described the old mechanism
and is corrected.

Verified in a real browser, not just by `pnpm verify`: the full Playwright
suite, 43/43, including "keeps the region applied while paging", which
exists to catch exactly this regression.

**Effort:** XS, as estimated.

---

## 5. No regression guard for the ad modal over a filtered grid

**Not a docs item — a gap in our own safety net**, recorded because
`HANDOFF.md` calls the `(browse)` route group a silent-breakage trap:
`@modal/(.)ad/[adId]` resolves `(.)` by route-segment level, and route groups
count toward that level, so moving `page.tsx` into `(browse)` (or deleting the
group) breaks the modal with no error anywhere.

**Now:** `e2e/ad-detail.spec.ts:185` exercises the modal only from `/`. No test
opens an ad from `/?region=XX`.

**Fix:** one test — go to `/?region=<a region that has ads>`, click a card,
assert the dialog appears and the URL changed. Cheap, and it locks the trap
shut.

**Shipped 2026-10-04** (`46cd4db`). One case in `e2e/ad-detail.spec.ts`,
"opens over a filtered grid". The region is derived from `/api/ads`
rather than hardcoded: the seed assigns regions at random, so a
hand-picked region can hold no ads in a given database and the test
would fail on its own precondition instead of on anything it is for.
Asserts the URL changed to the card's href (`?region=` does not
follow — the card links to `/ad/<id>`, not to the current URL with a
path appended), the dialog appeared, and the grid is still mounted
behind it. Suite is now 44 specs.

**The trap does not reproduce, and the item is better for knowing
that.** Both "obvious" rearrangements were measured against
Next.js 16.3.6: the home page moved into `(browse)` (in dev *and*
against a production build) and everything at root with the group
deleted (dev). The modal intercepts in all of them. What the
`(browse)` move does break is `tsc` — the generated route types and
`home-cursor.test.ts` / `home-metadata.test.ts` import `@/app/page`
by path — so `pnpm verify` already refuses the rearrangement before
it can ship. The type-checker, not an e2e test, is the guard here.
What *is* real, re-verified while measuring: `loading.tsx` at root
answers 200 instead of 404 for a missing ad (§9.4's bug), which is
the reason the group exists. HANDOFF.md §3 carries the corrected
claim.

**The test can fail, and was made to.** Renaming the intercepting
directory to a route that does not exist turns the click into a plain
navigation: the URL still changes, and the test fails on the dialog
never appearing — the same shape as any real interception failure.
The dialog and grid-behind assertions, not the URL, are what notice
it.

**Effort:** XS, as estimated.

---

## 6. No generated OG images

**Docs:** [`production-checklist.md:114`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md).

**Now:** the OG *metadata* is thorough (`src/app/metadata.ts`, per-ad
`openGraph` in `src/app/ad/[adId]/page.tsx`), but no route emits an image, so a
shared link renders a text-only card. `metadata.ts` even documents the gap: "the
home page has no single correct image, and adding one is a deliberate follow-up
rather than a default".

**Fix:** `opengraph-image.tsx` via `next/og` on `/ad/[adId]` (the ad's own photo,
title, price, region) and a static one for the home page. Watch two things: the
image route is a server route, so it must not leak `contactPhone` or the poster
id — `e2e/ad-detail.spec.ts:161` already asserts the HTML does not, and the
generated image is a second surface for the same leak. And `SITEMAP_AD_LIMIT`
already bounds what the crawler is told about; the image route is uncached per
ad, so give it a sensible `cacheLife` or accept the regeneration cost.

**Effort:** M.

---

## 7. No Content Security Policy or other security headers

**Docs:** [`production-checklist.md:107`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md)
— "consider adding a Content Security Policy".

**Now:** `next.config.ts` configures only `compiler.styledComponents` and
`images.remotePatterns`. No `headers()`.

**Fix:** start with a report-only CSP and tighten from the console output. Expect
to allow: `'self'`, `blob:`/`data:` for images and styled-components,
`https://picsum.photos`, `https://avatars.githubusercontent.com`,
`https://lh3.googleusercontent.com`, plus `frame-ancestors` and
`form-action 'self'`. UploadThing and Google sign-in will need their own origins —
check what `next-auth` actually redirects to rather than assuming
`accounts.google.com`. Add `Referrer-Policy`, `X-Content-Type-Options` and
`Referrer-Policy` alongside it.

**Effort:** M, and it needs a real browser pass to get right — do not ship it
verified only by `pnpm build`.

---

## 8. Missing `loading.tsx` on two routes

**Docs:** [`production-checklist.md:66`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md)
— use loading UI and Suspense to stream.

**Now:** `(browse)/loading.tsx` and `dashboard/[userId]/loading.tsx` exist.
`/ad/[adId]` and `/moderation` have none, so navigating to either blocks on the
full page with no indication.

**Fix:** small skeleton components in the existing `.styles.tsx` pattern.
`/ad/[adId]` is the one with a caveat — it is normally reached through the
intercepting modal, which renders beside a grid that is already loaded, so a
skeleton there is only seen on a direct visit or a cold client navigation.
Decide whether that is worth it rather than adding it by symmetry.

**Effort:** S.

---

## 9. Hand-written route prop types, `typedRoutes` off

**Docs:** this version generates route types — `PageProps<'/ad/[adId]'>` and
friends — instead of asking you to declare the shape yourself.

**Now:** every page declares its own prop type by hand
(`src/app/page.tsx:25`, `src/app/ad/[adId]/page.tsx`, `src/app/dashboard/[userId]/page.tsx:35`).
`typedRoutes` is not enabled in `next.config.ts`.

**Fix:** enable `typedRoutes`, switch the pages to the generated
`PageProps<'/…'>` types, and let `tsc` find the mismatches. This is a
type-only change with no runtime effect, so it is safe to do on its own — but do
it *before* item 1, not after, so the new `error.tsx` files are not written
against a convention that is about to change.

Worth knowing when editing `src/app/layout.tsx`: it cannot be imported by a test
(it pulls in `next/font/google` and the UploadThing SSR plugin), which is why
`metadata.ts` and `not-found.styles.tsx` exist as separate modules. That reason
applies to `global-error.tsx` too, and is the reason it should not import
`next/font`.

**Effort:** S.

---

## 10. Card cover image duplicates the title for screen readers

**Now:** `src/components/AdSummaryCard/AdSummaryCard.tsx:55` sets
`alt={title}` on the cover image, and the same title is rendered as text
immediately beside it. A screen-reader user hears it twice. The gallery
thumbnails already do the right thing (`alt=""`, `AdPhotosGallery.tsx:159`).

**Fix:** `alt=""` on the cover, or a description that adds something
("Fotografie inzerátu: {title}"). The second is defensible; pick one and say why
in a comment.

**Effort:** XS.

---

## 11. Investigate: client bundle size — measure before touching anything

**Docs:** [`production-checklist.md:145`](node_modules/next/dist/docs/01-app/02-guides/production-checklist.md)
— analyze bundles; and `:18` on lazy-loading Client Components and third-party
libraries where appropriate.

`motion`, `@radix-ui/*` and `@uploadthing/react` are imported from client
components in several places. **This item is an investigation, not a change.**
Install `@next/bundle-analyzer`, look at what actually dominates, and only then
decide whether `motion` (used for the region-link background animation and the
card image) earns lazy loading or a lighter substitute. Do not pre-optimise
this on the strength of a dependency list.

**Effort:** S to measure, unknown to fix.

---

## Deliberately not doing

**Cache Components / Instant Navigation.** Decided against on 2026-10-03. Not a
config flip — it would introduce this app's first cache layer, and four things
stand in the way:

1. **Two `Date.now()` calls are build errors under Cache Components, and
   `instant = false` does not clear them** (synchronous IO cannot be deferred):
   `src/lib/seo.tsx:242` in `adAvailability()`, which feeds the JSON-LD on
   `/ad/[adId]`, and `src/app/moderation/page.tsx:323`, the "x days ago" column.
2. **The theme cookie is read at the top of the root layout**
   (`src/app/layout.tsx:41`), where no boundary can be put above it. Per
   `instant.md:88`, `instant = false` on the root layout disables static-shell
   validation for the *whole app* — the one segment that cannot be wrapped gates
   the feature for everything below it.
3. **Staleness collides with moderation.** Today a takedown is visible on the
   next request. Cached, `deleteAdAsModerator` leaves an ad's contact phone
   number on the page until `stale` expires unless all seven actions in
   `src/server/actions/` invalidate by tag. One missed tag is a taken-down scam
   ad still being served. The default cache is also per-instance in-memory, so
   on serverless there is no cross-instance invalidation guarantee at all.
4. **next-auth v4.** `getServerSession` (`src/lib/session.ts:22`) reads the
   cookie deep inside itself, so it cannot be lifted into a plain `use cache`.

**No data caching either** (`'use cache'`, `unstable_cache`). This contradicts
`production-checklist.md:68`, and that is the right call: a marketplace where a
takedown must disappear immediately is the case where a stale read is a
correctness bug, not a slow page. Do not let a future pass "fix" this.

**Consequence worth remembering:** `cookies()` and `getCachedSession()` in the
root layout mean every HTML route is dynamic — `next build` reports `ƒ` for all
nine. That is what `production-checklist.md:47` warns about, and it is the
reason TTFB is a Neon round trip plus a JWT decode. It is a cost, not a defect,
and it is the price of the decision above.

---

## Verifying any item on this list

```
pnpm verify          # lint + tsc + unit tests + build
```

`pnpm verify` rebuilds `.next`, which corrupts a running `next start`. Kill it
first — Playwright reuses that server via `reuseExistingServer: true` and will
report a cascade of false failures otherwise:

```
pkill -f "next start"; lsof -ti:3000 | xargs kill -9
```

`pnpm commit` sweeps the whole index, not just what you staged. Check
`git status` before committing.
