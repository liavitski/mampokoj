# SPEC: generated Open Graph images

Status: **shipped 2026-10-04**. Implements `todo.md` item 6.

This is the spec *and* the plan; `todo.md` is the work list, so the tasks below are
recorded there inside item 6 rather than in a separate tracker.

---

## Objective

Every URL this site can be shared from currently shares as text with no picture:
`metadata.ts` deliberately sets no site-wide `images`, and `/ad/[adId]` points
`og:image` at the ad's own photo — which is the *only* picture surface today, and
which is a bare photo with no price, no city and no region on it. A link pasted
into a Czech chat, which is how a listing is actually shared, arrives as a bare
URL or as a card that shows a room and nothing else.

Two image routes ship:

1. `/ad/[adId]` — the ad's own photo beside its title, price, city and region,
   with a text-only layout for an ad whose photo cannot be loaded.
2. `/` — one generic site card: `Mam Pokoj` and the Czech tagline.

Success, stated as things that can be checked:

- `curl /ad/<id>` answers `og:image` and `twitter:image` pointing at
  `/ad/<id>/opengraph-image`, and fetching that URL answers `200 image/png`,
  1200×630.
- The card renders for an ad with **no** photo at all, and for an ad whose photo
  URL 404s.
- `curl /ad/<id>/opengraph-image` for a taken-down ad answers 404.
- The card image contains no contact phone number, no poster id, and no
  moderation state.
- `curl /` carries an `og:image`, and `curl /dashboard/<id>` still carries none
  of that ad's data (it inherits the generic card, which is site-level only).
- Czech diacritics render as glyphs, not tofu.

Who this is for: the person receiving the link. Nobody visits `/opengraph-image`.

---

## Measured before designing (Next.js 16.3.6)

These three were established by running the thing, not by reading the docs, and
each of them contradicts or narrows what the docs say.

**1. Which image wins depends on the environment, which is why the page declares
none.** `generate-metadata.md:114` says file-based metadata overrides
`generateMetadata`. Measured twice on one commit against 16.3.6, with the ad's
photo present in `generateMetadata.openGraph.images`:

| | `og:image` emitted |
|---|---|
| `pnpm dev` | the photo — and **no card at all** |
| production build | the generated card — the photo is dropped |

So the documented precedence holds of a build and not of development. Declaring
both is the one arrangement that is wrong somewhere, and in a way a developer
cannot see: the card would exist only in production. `page.tsx` therefore declares
no `images`, which makes the file convention the sole authority in both
environments. Everything below follows from that one decision.

**2. A photo that cannot be loaded 500s the whole route.** With `<img src={url}>`,
satori logged `Can't load image …: Unsupported image type: unknown`, then threw
`Image size cannot be determined`, and the route answered **500**. This is
reachable, not hypothetical: dangling photo rows are a documented, *expected*
state here (HANDOFF §2.2 — reconciliation never deletes a dangling row, because a
deleted ad's rows are indistinguishable from damage), and `teardownAd` removes
files. One dead URL would mean every share of that ad has no picture at all.
Hence the photo is fetched by our own code, guarded, and passed as bytes; a
failure renders the text-only layout instead.

**3. One `opengraph-image` file emits both `og:image` and `twitter:image`,**
with `type`/`width`/`height`/`alt` for each. No `twitter-image.tsx` is needed.
Czech diacritics (`ěščřžýáíé`) render correctly on `next/og`'s built-in font, so
no font file is added — which also keeps the route inside the 500 KB bundle
budget and avoids `next/font`, whose `woff2` output `ImageResponse` cannot read
(`ttf`/`otf`/`woff` only).

---

## Design

### `/ad/[adId]` — `src/app/ad/[adId]/opengraph-image.tsx`

- `size = { width: 1200, height: 630 }`, `contentType = 'image/png'`, and a
  static `alt` (the export is a constant string, so it cannot carry the ad's
  title).
- `getValidatedAd(adId)`; `null` → `new Response(null, { status: 404 })`. The
  same takedown semantics as the page, so a removed ad cannot keep a live card.
- Photo: `loadOgPhoto(url)` returns `data:<mime>;base64,…` or `null` — `null` on
  a non-OK response, a non-image content type, a read error, or a timeout.
  Enforced by `AbortSignal.timeout`, because a crawler fetching a card must not
  be able to hang our route on a slow storage host.
- Layout: photo on the left at its natural aspect, text column on the right
  (title, `city · price`, Czech region name via `regionName`), site name in the
  footer. Text-only layout when the photo is `null`.

### `src/lib/og-card.ts` — the pure part

`adCardData(ad)` maps a row to exactly `{ title, city, price, region, photoUrl }`
and nothing else. It exists so the "no phone number on the card" claim is a unit
test on a value rather than a promise about pixels nobody can read out of a PNG.
The route composes JSX; this module decides *what may be composed*.

### `src/app/ad/[adId]/page.tsx` — the change that makes it real

`openGraph.images` and `twitter.images` are removed, with the reason (finding 1)
in the comment where they were. This is a deliberate loss, recorded here:

- **`og:image:alt` stops being the ad's title.** `alt` is a static export, so the
  generated card's alt text is generic. Alt text on a share card is a fallback
  description for platforms that render no image; the title and description
  around it are unchanged and remain per-ad. Accepted.
- **The card is no longer the raw photo.** It is the photo plus the facts a
  photo cannot carry. This is the point of the item.

### `src/app/opengraph-image.tsx` — the site card

Static: `APP_TITLE` plus the tagline, no database, no request. Satori renders it
once.

Scope, stated rather than discovered: the app root is the root *segment*, so this
card is inherited by `/dashboard/[userId]`, `/moderation` and the 404 as well as
`/`. Those routes are `noindex` and disallowed in `robots.txt`, so nothing
indexes the card; and `@modal/(.)ad/[adId]` inherits the site card on a soft
navigation while the address bar already reads `/ad/<id>` — unfurlers and
crawlers never run the app's JavaScript, so they always get the ad card from the
real URL. Not worth a second image route to fix.

**A per-region home card is not possible, and this is now known rather than
assumed.** `/?region=XX` is a query parameter, and the image route receives only
`params` (`opengraph-image.md`: the props table gives `undefined` for a
non-dynamic route). Fourteen region pages therefore share one card, and the
region's own name lives in `og:title`, where it already does today. HANDOFF
§2.3's "a generated image per region is the natural follow-up" is wrong for this
route shape and is corrected there.

### Caching: none, deliberately

No `revalidate`, no `cacheLife`. `todo.md`'s "Deliberately not doing" records
why for a marketplace where a takedown must disappear immediately, and an OG card
is the same failure one step removed: a cached card keeps an ad's title, price
and photo readable from a stable public URL after `deleteAdAsModerator` has
removed the ad itself. The cost is one satori render plus one photo fetch per
share — paid by the crawler, not by a visitor, and the ad page itself is what a
visitor waits on. Stated here so a later pass does not "optimise" it into the
bug the rest of this repo refuses.

---

## Testing strategy

Framework as the rest of the repo: Vitest, `// @vitest-environment node` for
server modules, tests in `__tests__` beside the code; Playwright for the
browser-level claims.

**Unit** — `src/lib/__tests__/og-card.test.ts`
- maps a row to title, city, formatted price, Czech region name
- omits `contactPhone`, `userId`, `slot`, `reportedAt` — asserted as absent
  keys *and* as the phone string not appearing in `JSON.stringify` of the result,
  following `metadata-routes.test.ts`'s existing phone-leak case
- returns the photo URL when there is one, `null` when there are none
- a row whose region code is unknown yields `null` for the region rather than
  `undefined`

**Unit** — `src/app/__tests__/opengraph-image.test.tsx`
- returns 200, `image/png`, and PNG magic bytes for an ad with a photo
- returns 200 and a PNG for an ad with no images
- returns 200 and a PNG when the photo fetch fails, non-OK, times out, or comes
  back as `text/html` — i.e. every path that measured as a 500 in finding 2
- returns **404** for a missing ad
- the route declares the documented `size`/`contentType`, so the emitted
  `og:image:width` cannot drift from the render

**Unit** — additions to `src/app/__tests__/metadata-routes.test.ts`
- `generateMetadata` for `/ad/[adId]` declares **no** `images`, so the file
  convention is the one that is emitted in both environments (finding 1). The
  existing "shares the ad photo" case is replaced by this, not deleted silently.
- `/ad/[adId]` has an image convention and the root has one, so the two
  `og:image` sources cannot both exist again.

**E2E** — `e2e/ad-detail.spec.ts`
- `GET /ad/<id>` carries an `og:image` on the page and fetching that URL answers
  `200` with `content-type: image/png` (the delivered bytes, not a rendered
  tree)
- `/` carries an `og:image`

**Not asserted, and said so rather than implied:** that the PNG *looks* right.
Glyph coverage, layout and photo placement are checked by fetching the two URLs
in a real browser and looking at them; a unit test cannot read a picture, and a
snapshot of PNG bytes would only prove determinism. That manual pass is part of
this task, not optional.

---

## Commands

```
pnpm test          # vitest run
pnpm verify        # lint + tsc + unit tests + build
pnpm test:e2e      # playwright, against a production build via E2E_BASE_URL
```

`pnpm verify` rebuilds `.next` and corrupts a running `next start`; kill it
first (`pkill -f "next start"; lsof -ti:3000 | xargs kill -9`) or the suite
reports a cascade of false failures.

---

## Tasks

- [x] **1. `src/lib/og-card.ts` + tests.** Acceptance: the mapping returns
  title/city/price/region/photo and none of `contactPhone`, `userId`, `slot`,
  `reportedAt`; unknown region → `null`. Verify: `pnpm test src/lib`.
  Files: 2. Scope: S.
- [x] **2. `src/app/ad/[adId]/opengraph-image.tsx` + tests.** Acceptance: 200 PNG
  with a photo, without a photo, and with every measured photo-failure; 404 for a
  missing ad. Verify: `pnpm test src/app`, then fetch the URL and look at it.
  Files: 2. Scope: S. Depends on 1.
- [x] **3. Drop `openGraph.images` / `twitter.images` from the ad page, update
  `metadata-routes.test.ts`.** Acceptance: `/ad/<id>` emits the generated URL for
  both `og:image` and `twitter:image`; the phone-leak case still passes. Verify:
  `pnpm test`, then `curl` the head. Files: 2. Scope: XS. Depends on 2.
- [x] **4. `src/app/opengraph-image.tsx` + e2e assertion for `/`.** Acceptance:
  `/` carries an `og:image` that answers 200 PNG. Verify: `pnpm test:e2e`.
  Files: 2. Scope: S.
- [x] **5. Browser pass on a production build, then the write-up.** Fetch both
  card URLs and look at them; confirm no 500s; then record the shipped state in
  `todo.md` item 6 and correct HANDOFF §2.3. Verify: `E2E_BASE_URL=http://localhost:3100 pnpm test:e2e`.
  Scope: S.

Each task leaves the tree green. 1–2 are the risky ones (the card must not 500),
so they come first.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `hsl()` in `style` — satori's colour support is a subset, unverified here | card paints black-on-black or throws | measure in the browser pass; fall back to hex literals from `LIGHT_TOKENS` |
| Photo fetch is slow or hostile | crawler's request hangs | `AbortSignal.timeout`, and the text-only layout covers every outcome |
| A photo >8 MB (the `opengraph-image.md` build limit applies to *files*, not renders) | oversized card | cap the read at a few MB and fall back to text-only |
| Root card leaks onto private routes | site card on a `noindex` page | nothing indexes it; stated in the file's comment |
| The 404 shape surprises the metadata resolver | — | measured before relying on it; a `Response` is a documented return type |

## Boundaries

- **Always:** run `pnpm verify` before committing; assert on what the code
  produced; assert the precondition of any browser check.
- **Ask first:** adding a dependency or a font asset; changing what
  `generateMetadata` emits for `/ad/[adId]` beyond the image fields; moving the
  card out of the app root.
- **Never:** put a contact phone number or poster id into a card; add
  `revalidate` to an image route (see the caching section); render a card for a
  taken-down ad.

## Open questions

None. Both resolved during implementation:

- **`hsl()` works.** Measured by rendering the same card with `hsl(20deg 5.8% 90%)`
  and with its hex equivalent `#e7e5e4`: byte-identical PNGs. So the card uses the
  app's own `LIGHT_TOKENS` rather than hex literals copied out of them, and cannot
  drift from the site's colours. The same measurement found the opposite risk worth
  knowing: an *invalid* colour throws `Failed to parse declaration`, so every colour
  in these files has to be a real one.
- **The renderer is lenient in a way that is worse than an error.** A mime it does
  not know is silently drawn as a filled block; bytes it recognises but cannot
  decode sometimes throw and sometimes do not. Hence the sniffing and the
  text-only fallback rather than a single validation step.

## What shipped, and what the tests do not say

Verified in a browser against a **production build** (`E2E_BASE_URL`), not against
`pnpm dev` — which is the whole point of finding 1. Both card URLs were fetched and
looked at; the price was printed twice on the first render, which no test could
have caught, and no seeded ad has no photo, so the text-only layout was rendered
directly to be looked at as well.