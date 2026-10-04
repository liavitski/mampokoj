# SPEC: Content Security Policy and security headers

Status: **shipped 2026-10-04**. Implements `todo.md` item 7.

This is the spec *and* the plan; `todo.md` is the work list, so the tasks below
are recorded there inside item 7 rather than in a separate tracker.

---

## Objective

The app sends no security headers at all. `next.config.ts` configures
`compiler.styledComponents` and `images.remotePatterns` and nothing else; there
is no `headers()`, no `middleware.ts`, no `proxy.ts`, no `frame-ancestors`, no
`nosniff`.

The concrete exposure, in order of severity:

1. **Clickjacking.** Nothing stops `/dashboard/[userId]` or `/moderation` being
   framed by an attacker's page. `/moderation` performs destructive actions
   (takedown) on click. `frame-ancestors 'none'` plus `X-Frame-Options: DENY`
   closes it.
2. **XSS with no backstop.** The app auto-escapes by default and has exactly one
   `dangerouslySetInnerHTML` (`ad-structured-data.tsx`, with `<` escaped and a
   test asserting a single `<script>` survives an injected `</script>`). That is
   the primary defence and it holds. A CSP is the *second* one, and today there
   is none: any future injection, in app code or in a dependency, executes
   silently.
3. **Content-type sniffing.** `nosniff` is absent on a site where users upload
   images and where third-party photo URLs are proxied.
4. **Referrer leakage.** The default policy is browser-dependent.

Success, stated as things that can be checked:

- Every HTML response carries a CSP with **no** `'unsafe-inline'` and **no**
  `'unsafe-eval'` in `script-src`.
- An injected inline `<script>` does not execute. Not asserted from a snapshot —
  actually observed in Chrome.
- `curl -I /` carries `nosniff`, a referrer policy, an HSTS header and
  `X-Frame-Options`.
- `frame-ancestors 'none'` on `/dashboard/[userId]` and `/moderation`.
- The whole existing Playwright suite (44 specs) still passes, **against a
  production build**, not only against `pnpm dev`.
- Photo upload still works under the enforced policy.

Who this is for: the person whose ad gets taken down, and the person whose
browser runs someone else's injected script.

---

## Measured before designing (Next.js 16.3.6)

Every one of these was established by running or reading the shipped source, not
from the docs or from a dependency list. Three of the four origins `todo.md`
item 7 guessed turned out not to be browser origins at all.

### The nonce costs nothing, because every route is already dynamic

`todo.md` §[Deliberately not doing] records that `cookies()` in the root layout
makes every HTML route dynamic. Confirmed against a fresh `pnpm build`:

```
┌ ƒ /            ┌ ƒ /_not-found      ┌ ƒ /(.)ad/[adId]   ┌ ƒ /ad/[adId]
├ ƒ /ad/[adId]/opengraph-image       ├ ƒ /api/ads        ├ ƒ /api/auth/[...nextauth]
├ ƒ /api/uploadthing                 ├ ƒ /dashboard/[userId]              ├ ƒ /moderation
┌ ○ /opengraph-image  ┌ ○ /robots.txt  ┌ ○ /sitemap.xml
```

Ten `ƒ`, three `○`. **None of the three static routes is an HTML document**, so
the doc's central warning — "you must use dynamic rendering to add nonces", and
the resulting loss of static optimisation, ISR and CDN caching — costs this app
**nothing**. That is the whole reason the strict option was available at all.

### `img-src` needs no remote origins

`todo.md` item 7 lists `https://picsum.photos`, `https://avatars.githubusercontent.com`
and `https://lh3.googleusercontent.com` as expected `img-src` entries. They are
not browser origins here.

Every `<Image>` (`AdPhotosGallery.tsx:97,160`, `AdSummaryCard.tsx:56`,
`AuthButton.tsx:55`) uses the **default** loader: no `loader=` prop, no
`unoptimized` prop, and `images` in `next.config.ts` carries only
`remotePatterns`. The browser therefore requests `/_next/image?url=<absolute
external url>` on the same origin, and the optimizer fetches the remote bytes
server-side. `'self' blob: data:` is sufficient.

`remotePatterns` is the optimizer's allowlist, not a CSP one. Conflating the two
would have widened the policy by four origins for no benefit — and
`avatars.githubusercontent.com` is vestigial anyway: the GitHub provider was
dropped (`src/app/api/auth/[...nextauth]/route.ts:8-13`) and nothing in `src/`
references that host.

### Google sign-in redirects to the app's own page, not to Google

`AuthButton.tsx:39` calls bare `signIn()` with no provider. next-auth v4 then
redirects to `<baseUrl>/signin?callbackUrl=…` — the same-origin built-in page
`/api/auth/signin` (`node_modules/next-auth/react/index.js:210-217`). That
document is built by next-auth's own Preact `renderToString`, not by Next.

Consequences, and they are the reason this is not a one-file change:

- It emits **inline CSS** (`node_modules/next-auth/src/core/pages/index.ts:35`),
  and next-auth v4 has no nonce support anywhere — `grep nonce` in its `src`
  finds only the OIDC nonce cookie and `checks`. A nonce-only `style-src` renders
  an unstyled sign-in page.
- Its provider logo comes from `authjs.dev` (`providerLogoPath`,
  `next-auth/src/core/pages/signin.tsx:111`), because `public/google.svg` does
  not exist in this repo. A real host, not a theoretical one.
- It has **no `<script>` at all**, so `script-src` is unaffected.

### UploadThing's presigned upload host, derived rather than guessed

The browser `PUT`s a presigned URL returned by this app's own
`/api/uploadthing` response (`node_modules/uploadthing/client/index.js:13`).
The host is not a constant anywhere in the repo — `todo.md` is right that it has
to be observed. It is derivable:

```
upload-builder-BlFOAnsv.js:57   const { regions, ingestHost } = yield* UTToken
upload-builder-BlFOAnsv.js:59   Config.withDefault(`https://${region}.${ingestHost}`)
shared-schemas-BmG5ARoX.js:29  ingestHost: S.String.pipe(S.optionalWith({ default: () => "ingest.uploadthing.com" }))
```

This app's `UPLOADTHING_TOKEN` decodes to `regions: ["sea1"]` and **no**
`ingestHost` key, so the schema default applies and the host is
`https://sea1.ingest.uploadthing.com`.

The policy uses `https://*.ingest.uploadthing.com` plus the bare host rather
than re-deriving that vendor schema at request time. Parsing it in `proxy.ts`
would duplicate `uploadthing`'s token schema in our code, and that schema can
drift in a way that silently widens or narrows a security policy; a subdomain
pattern scoped to one vendor host cannot drift that way. The alternative — an
exact `sea1.` host — breaks silently the day a second region is enabled.

Measured in Chrome: `fetch('https://sea1.ingest.uploadthing.com/', {mode:'no-cors'})`
reaches the network, `fetch('https://picsum.photos/')` is refused. `connect-src`
is therefore a live directive, not inert text, and the wildcard covers the real
host. The bare apex is also refused — but at **DNS**, not at the policy, since
`ingest.uploadthing.com` does not resolve while `sea1.` does. It is kept as
defensive cover for a future non-regional presigned URL, not because it is proven
to work.

### Two inline scripts that cannot be nonced

| Source | Where | Nonce support |
|---|---|---|
| Next.js framework/RSC bootstrap | framework | **yes** — Next parses the CSP request header for `'nonce-…'` and attaches it (`content-security-policy.md:185-193`) |
| JSON-LD | `ad/[adId]/ad-structured-data.tsx:64-76` | n/a — `type="application/ld+json"` is a data block, not script; verified in Chrome |
| UploadThing SSR plugin | `@uploadthing/react/next-ssr-plugin/index.js:14`, via `layout.tsx:99-101` | **no** — `dangerouslySetInnerHTML` with no `nonce` prop. Renders on **every** page. |
| next-auth sign-in page | `next-auth/src/core/pages/index.ts:35` | **no** — inline `<style>`, and it is not a Next.js document at all |
| `global-error.tsx` | `src/app/global-error.tsx` | inline `style={{}}` objects, by design (item 1) |

Only the UploadThing script needs a real answer, and its content is
**deterministic**:

```js
// node_modules/@uploadthing/react/next-ssr-plugin/index.js
const html = [`globalThis.__UPLOADTHING = ${JSON.stringify(props.routerConfig)};`];
return jsx("script", { dangerouslySetInnerHTML: { __html: html.join("") } }, id);
```

`routerConfig` is `extractRouterConfig(ourFileRouter)` from
`src/app/api/uploadthing/core.ts`. Hashing it against the real router:

```
globalThis.__UPLOADTHING = [{"slug":"imageUploader","config":{"image":{"maxFileSize":"4MB","maxFileCount":1,"minFileCount":1,"contentDisposition":"inline"}}}];
sha256-9rh1hg0t8gzBb+71sg04fUOw1ZnwOMplqN4Jqi1j5o4=
```

The plugin also assigns `globalThis.__UPLOADTHING` directly during render, so
even a blocked script degrades rather than breaks: `@uploadthing/react` falls
back to fetching `/api/uploadthing` — same origin, allowed — and uploads still
work, just with one extra request. The failure mode is a violation report, not a
broken feature. That asymmetry is why the hash is acceptable at all, and why
`getRouteConfig` (the one API that *throws* without the plugin) being unused
(`grep getRouteConfig src/` → nothing) removes the hard-failure case entirely.

**This same fact invalidated the obvious test, and only mutation testing found
it.** The natural assertion — "`globalThis.__UPLOADTHING` is defined, therefore
the hash matched" — cannot fail: the global is assigned during render whether or
not `script-src` admitted the script. It was written, it passed, and it then
passed again against a build whose hash had been deliberately corrupted. The
assertion that does work is the **absence** of a `securitypolicyviolation` with
`blockedURI === 'inline'` on `script-src`, which now fails on exactly that
mutation. The weaker assertion is kept and relabelled honestly as a functional
check.

### A second unfalsifiable test, and what it means for verification

The injection test first injected a script through `page.evaluate`. Chrome treats
a script element created via the DevTools protocol as a **trusted** script
creator and exempts it from CSP entirely, so that test reported success while
testing nothing — it would have passed against a policy with no `script-src` at
all. The script now goes into the *markup*, by intercepting the response, which
is the shape a real injection takes: untrusted script bytes inside a document
that carries our policy.

Both were verified to fail under mutation. Neither was verified by reading it,
and both looked fine.

### `'unsafe-inline'` and `'strict-dynamic'` together

While mutating, `'unsafe-inline'` was added to `script-src` and the injection
test **still passed** — correctly. CSP3 ignores `'unsafe-inline'` when
`'strict-dynamic'` is present, so that combination was never a vulnerability in
the first place. The text-level test is what catches its reintroduction, and it
does. Worth knowing so nobody reads the passing injection test as proof the
policy is strict: it is `'strict-dynamic'` plus the nonce that do that work.

---

## Design

### One policy, one module, one authority

`src/lib/csp.ts` is pure string building with **no imports** — no `server-only`,
no database, no vendor schema. It is consumed by `src/proxy.ts` and by unit
tests.

`proxy.ts` deliberately does **not** import the upload router. `proxy.md`
warns that proxy "should not attempt relying on shared modules or globals", and
`core.ts` transitively imports `@/server/db`, which throws at module scope
without `DATABASE_URL`. The hash is therefore a literal in `csp.ts`, held honest
by a test that recomputes it from the real router — not derived at request time.

`middleware.ts` is **deprecated** in Next 16 and renamed to `proxy.ts`
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`).
This version uses `proxy.ts`.

### The policy

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
frame-src 'none';
form-action 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic' 'sha256-9rh1…'  [+ 'unsafe-eval' in dev]
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://authjs.dev;
font-src 'self';
connect-src 'self' https://ingest.uploadthing.com https://*.ingest.uploadthing.com;
media-src 'self';
worker-src 'self' blob:;
manifest-src 'self';
```

Decisions worth defending:

- **No `'unsafe-inline'` in `script-src`.** This is the point of the exercise.
  `'strict-dynamic'` is what makes it safe to omit host sources: CSP3 browsers
  ignore `'self'` in `script-src` when `strict-dynamic` is present, which
  closes the "an attacker who can inject a `<script src>`" case too. Hash and
  nonce sources are not host-based and keep working alongside it.
- **`'unsafe-inline'` *is* kept in `style-src`.** Three independent blockers,
  any one of which is fatal: next-auth's own sign-in page (no nonce support
  anywhere in v4), `global-error.tsx`'s inline `style` objects (item 1's
  deliberate design, on a document where styled-components is not mounted), and
  styled-components' client-side re-injection. Since `'unsafe-inline'` is
  present, a `style-src` nonce would be ignored anyway — so `src/lib/registry.tsx`
  is **not** modified. Recorded as a deliberate non-change rather than left
  looking like an oversight.
- **No `upgrade-insecure-requests`.** The docs' every example includes it, and
  it is a foot-gun here: it upgrades *subresource* requests, so on an
  `http://` deployment — including `next start` on `http://localhost:3000`, which
  is exactly what `E2E_BASE_URL` points the Playwright suite at — every same-origin
  script and stylesheet would be requested over https and fail. Gating it on
  `NODE_ENV` is the same class of bug as `todo.md` item 6's dev-vs-build
  precedence trap: a production build served over http would break while the
  `NODE_ENV` check said it was fine. HSTS covers the production case without
  that branch, and browsers ignore HSTS received over http, so it is safe to send
  unconditionally. **Not adding it is the decision; do not "fix" this later
  without a protocol check.**
- **`'unsafe-eval'` in development only.** `content-security-policy.md:42`: React
  uses `eval` to reconstruct server error stacks in the browser. Absent from the
  production policy. `'unsafe-eval'` must be *absent* in production, so the
  condition is asserted in a test rather than eyeballed.
- **No `picsum.photos` / `avatars.githubusercontent.com` / `lh3.googleusercontent.com`
  / `gtiivfj57h.ufs.sh` in `img-src`**, per the measurement above.

### Matcher: `/api` is *not* excluded

The docs' example matcher skips `api`:

```ts
source: '/((?!api|_next/static|_next/image|favicon.ico).*)'
```

That would leave `/api/auth/signin` — the one place next-auth renders a real HTML
document — with no CSP at all. The matcher here excludes only static assets, so
the sign-in page gets a policy too. Its inline `<style>` is permitted by
`style-src 'unsafe-inline'`, and it has no scripts to block. Verified in
`pnpm verify` that `/api/auth/providers` and `/api/auth/csrf` still answer
normally: the proxy only *adds* request headers and never removes or rewrites.

Prefetch requests are still skipped, per the docs, so client-side navigation
does not pay for a nonce.

### Non-CSP headers: `next.config.ts`, not the proxy

`headers()` in `next.config.ts` applies to every response including static
assets, which is where `nosniff` matters most, and it needs no nonce:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()` |

- `X-Frame-Options: DENY` alongside `frame-ancestors 'none'` even though the
  docs call it superseded: `frame-ancestors` is ignored by older Safari and any
  non-browser embedder, and the site has no reason to be framable at all.
- HSTS **without** `preload`. Preload is a submission to a browser vendor list
  covering the registrable domain and every subdomain; this app is deployed to a
  Vercel-owned hostname, so claiming it would be a statement about someone
  else's domain.
- `Permissions-Policy` denies everything. The app opens no camera (upload is a
  file input), takes no payment, and asks for no location. Nothing to allow.
- `Referrer-Policy` is `strict-origin-when-cross-origin`, one step stricter than
  the docs' `origin-when-cross-origin` example. `todo.md` item 7 lists
  `Referrer-Policy` twice; it is one header.

Not a header but the same decision: `poweredByHeader: false` drops
`X-Powered-By: Next.js`. Nothing reads it, and it is free reconnaissance — it
names the framework to a scanner before the scanner has read a byte of the app.
Added after the first pass: a `curl` of the production response during
verification showed the header still going out. The e2e assertion for it is
falsifiable by that measurement, not by assumption — the same `curl` had it
present one commit earlier.

`todo.md` item 7's own advice was "start with a report-only CSP and tighten from
the console output". That is the right instinct for an app with a large unknown
surface, and it is **not** what ships here, because the surface turned out not
to be unknown: the allowlist above is derived from source and measured, not
guessed. Report-only would have left the two inline scripts unverified — a
report-only policy reports the UploadThing violation and then permits it anyway,
so the hash would never be proven before it started blocking. The browser pass in
[Verification](#verification) is what replaces that loop, and it runs against the
**enforced** policy.

---

## Verification

Two layers, because they fail differently.

**Unit (`src/lib/__tests__/csp.test.ts`)** — the policy as text. That the
production `script-src` contains neither `'unsafe-inline'` nor `'unsafe-eval'`;
that development adds `'unsafe-eval'` and production does not; that the nonce
appears and is the caller's; that no `remotePatterns` hostname leaked into
`img-src`; and the anti-rot case:

> **The UploadThing hash is recomputed from the real router** — importing
> `ourFileRouter` with `@/server/attach-image` and `@/server/upload-guard` mocked
> (each has module-level work a hash test has no business running) — and asserted
> equal to the literal in `csp.ts`. If someone adds a second route or changes
> `maxFileSize`, this fails instead of the upload quietly losing its config.

**End-to-end (`e2e/security-headers.spec.ts`)** — headers as bytes off the wire,
following the existing `e2e/` conventions (`request` fixture, relative paths,
`appShell` scoping, read-only and anonymous).

**Browser pass — the part `pnpm build` cannot do.** Per `todo.md` item 7: *"do
not ship it verified only by `pnpm build`"*. Against a **production build**:

1. Load `/`, `/ad/<id>`, `/moderation`, `/dashboard/<userId>`.
2. Collect every CSP violation from `securitypolicyviolation` events and from the
   DevTools console. **Expect zero.**
3. Assert `globalThis.__UPLOADTHING` is defined in the page — direct proof the
   hash did match under `strict-dynamic`, which a green test suite does not
   establish.
4. Confirm the page is not styled-broke: styled-components' `<style>` present and
   the grid rendered.
5. Inject `<script>alert(1)</script>` and confirm it does **not** run.
6. `/api/auth/signin` still renders, with its logo and its inline CSS.

Then the **full** Playwright suite against that same production build — the
`todo.md` item 6 lesson is that `pnpm dev` shows the opposite of what ships. 59/59
in both, with the dev run additionally confirming `'unsafe-eval'` is present
there and absent from the production policy.

### A trap in the harness itself

`playwright.config.ts` sets `reuseExistingServer: true`, so **the suite reuses
whatever is on :3000 without checking that it matches the working tree.** Two
mutations were run against a stale build and both reported green.

The cause is a chain of three things that each look harmless: `next build`
type-checks `e2e/`, so a type error in a spec fails the build; a
`pnpm build && pkill` chain only kills when the build succeeded; and the surviving
server serves the *previous* `.next`. The type error was mine and is fixed, but
the trap is not. **Kill :3000 before any e2e run that follows a source change.**
Recorded in `HANDOFF.md` §1 and §4.

### Not verified

An actual photo upload. `connect-src` is proven enforced and the upload host is
proven reachable, but the upload itself needs a session and every e2e spec is
anonymous by design. If uploads ever break under this policy, that is where to
look first, and `SPEC-csp.md`'s hash derivation is the thing to re-check.

---

## Deliberately not doing

- **Removing the UploadThing SSR plugin.** It would delete a global script
  injection from every page, which is the tidier outcome, and `@uploadthing/react`
  does fall back to a same-origin fetch. Rejected: upload paths cannot be covered
  by this repo's e2e suite (every spec is anonymous and read-only), so the change
  would be unverifiable where it matters. The hash has a test instead.
- **Reporting.** `Content-Security-Policy-Report-Only` and `report-to` need an
  endpoint to receive reports; there is no reporting service in this project at
  all (`error.tsx:36-39` says so explicitly). Adding report-only without a
  collector would produce violations nobody reads — a header that looks like
  monitoring and is not.
- **Experimentally hashed CSP via `experimental.sri`.** Listed in
  `content-security-policy.md`, App Router only, and it addresses *external*
  script integrity. The only external scripts here are Next's own, already
  covered by the nonce.
- **SRI, `report-to`, `navigate-to`.** `navigate-to` is unimplemented in Chrome
  and would not have covered the Google OAuth hop anyway (that is a top-level
  navigation from a next-auth-rendered page, gated by nothing CSP3 ships).