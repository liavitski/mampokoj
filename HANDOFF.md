# HANDOFF

State of the repository and what to do next. Written to be read cold, with no
memory of the work that produced it.

- **Branch:** `security/harden-server-actions` (11 commits ahead of `main`, unpushed)
- **Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 135 tests
  across 17 files, `next build` succeeds
- **Stack:** Next.js 16.3.6, React 19.3, pnpm 11.1.3, TypeScript 5, Drizzle +
  Neon Postgres, NextAuth v4, UploadThing, Upstash, styled-components v6, Vitest

---

## 1. Read this first

Two environment facts that will otherwise waste your time:

1. **Use `pnpm` 11.1.3.** `packageManager` is pinned. The global `pnpm` on this
   machine is 9.0.0 and will fail with
   `ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION` / `ERR_PNPM_UNEXPECTED_STORE`.
   Run `corepack enable`, or invoke `npx pnpm@11.1.3 <cmd>`.
2. **`pnpm-workspace.yaml` is not a workspace file.** It exists only to hold
   `allowBuilds`. Do not add a `packages:` key; this is a single-package repo.
   `sharp` is intentionally not built (Vercel supplies it for `next/image`).

---

## 2. What was just done

A review-and-harden pass over a codebase that had **zero tests and zero CI**.
Eleven commits, each independently green:

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

### Vulnerabilities that were real and are now fixed

- Any authenticated user could **rewrite or delete any ad** by passing an
  arbitrary `adId` — `updateAd` checked only that *someone* was signed in.
- `addImageToAd` took a `userId` **parameter** and compared it to the ad's
  owner. Since Server Actions are reachable by direct POST, passing the
  victim's `userId` satisfied the check.
- `GET /api/ads` returned whole rows to anonymous callers, exposing every
  poster's **OAuth account id and phone number**. The server-rendered pages
  already stripped both; the API undid it.
- The "max 2 ads per user" limit existed **only in dashboard JSX**.
- UploadThing stored and billed for files aimed at **other users' ads** before
  rejecting them in `onUploadComplete`.
- `src/utils/seed.tsx` inserts a `userId` into the `images` table, which has no
  such column — the script throws. Still broken, see below.

### The mistake worth knowing about

An adversarial review of my own work found that my `toPublicAd` "barrier" was
incomplete: it restricted the *ad* columns but passed the nested `images`
relation through verbatim, so **`fileKey` — the argument to
`deletePhotoByFileKey` — was returned by `/api/ads` for every ad**. No test
caught it because every privacy fixture used `images: []`.

**Lesson for whatever you write next:** a privacy allowlist that covers the
parent object says nothing about nested relations. And a fixture with an empty
collection tests nothing about that collection.

---

## 3. Next steps, in recommended order

### 3.1 Fix the seed script (small, certain)

`src/utils/seed.tsx:139` sets `userId: ad.userId` on an `images` row. The
`images` table has no `userId` column, so the insert is rejected. Delete the
line. There is also no `db:seed` script — add
`"db:seed": "tsx src/utils/seed.tsx"` once the insert works.

Worth a test: seed against a real database is not unit-testable, so at minimum
add `userId` removal and verify by running it.

### 3.2 Decide on end-to-end tests (blocked on a decision)

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
→ intercepting modal → 404 for a deleted ad. Anonymous flows only; the
authenticated dashboard CRUD is already covered at the action level, where the
assertions are far more precise than anything a browser can make.

### 3.3 Make the ad limit atomic

`createAd` does `count()` then `insert()`. Ten parallel requests all read
`count = 0` and all insert. Closing this needs either a transaction with
appropriate isolation, or a database-level constraint (e.g. a partial unique
index per user), or a per-user lock in Redis — Upstash is already a dependency.

This is the one known authorization-adjacent gap left open. It was left open
deliberately: it is a schema/transaction change, not a one-file fix.

### 3.4 Consider `next-auth` v5

Still on v4. Auth.js v5 is `5.0.0-beta.32` — beta after three years. Not
worth it now; the ownership model no longer depends on which version is in use.
Revisit only if v5 goes stable.

### 3.5 Deferred upgrades (explicitly out of scope, agreed)

`motion` 12→13, `eslint` 9→10, `@types/node` 20→26, `typescript` 5→7 (the Go
rewrite). One dependency per change, each with a green suite before and after.

Also `next@16.3.7` is available but was published on 2026-09-29. This
machine's `~/.npmrc` sets `min-release-age=3` (days), which pnpm surfaces as
`minimumReleaseAge: 4320` minutes — a supply-chain guard, and **not** a repo
setting, so do not go looking for it in `pnpm-workspace.yaml`. 16.3.6 is the
newest version past that window. Do not disable the guard; just take 16.3.7
once it has aged.

### 3.6 Known product decision, not a bug

`contactPhone` is visible on the ad detail page to **any signed-in user**, not
just the owner. This predates the review work and looks intentional. If the
threat model is "contact data must not leak", that is the remaining path —
gate it on `currentUser?.userId === ad.userId` in
`src/components/AdCard/AdCardCompact.tsx`.

---

## 4. Conventions to follow

**Ownership goes in the query.** `findAdOwnedByCurrentUser`
(`src/lib/ads.ts`) constrains the `WHERE` clause by `userId`. Never
fetch-then-compare — that reads the row before settling access.

**"Not yours" and "does not exist" return the same thing.** Otherwise responses
enumerate which ids exist.

**Never return a raw database error to the client.** It names tables, columns
and constraints. Log it, return a generic message. Validation failures may
explain themselves; unexpected failures may not.

**Never trust a value a Server Action receives.** Derive identity from the
session. `addImageToAd` and `getSessionUser` were both briefly `'use server'`
and had to be `server-only` — see §2.

**Allowlist, don't omit.** `toPublicAd` lists fields explicitly so a new column
does not become public by accident, and `PublicAd` makes TypeScript fail until
someone decides otherwise.

### Testing conventions

- Server-side test files start with `// @vitest-environment node`. Default
  environment is jsdom.
- Tests live in `__tests__` folders beside the code.
- **Assert authorization against compiled SQL**, via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock returning "no row" passes even
  when the check is removed — that mistake was made and caught once already.
- Before believing a test proves something, revert the fix and confirm it
  fails. The `expect(mocks.x).toHaveBeenCalled()` shape proves nothing.

### Known-fiddly bits

- `AdGrid` and `AdPhotosGallery` need `vi.mock` for `next/navigation` and
  `../ToastProvider`; `useSearchParams` returns null outside a router.
- `RegionSelectBlock` is `display: none` by default (shown only under a media
  query that jsdom does not evaluate), so queries need `{ hidden: true }`.
- Radix `Select` will not open its portal in jsdom while the trigger is
  hidden, so the "pick a region" path is not unit tested — it wants E2E.
- `Icon` renders a real `<svg>`; `react-feather` was inlined and removed
  (unmaintained since May 2022). `paths` in `src/components/Icon/Icon.tsx` is
  the icon set — add there, not to a new dependency.

---

## 5. Useful commands

```bash
pnpm verify          # lint + typecheck + test + build — the pre-push gate
pnpm test            # 135 tests
pnpm test src/lib    # one directory
pnpm db:studio       # inspect the database
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every
push and PR to `main`. Since Next.js 16 no longer lints inside `next build`,
this workflow is the **only** automated gate in the repo.

---

## 6. Things deliberately not done

- No `CONSTRAINTS.md`. Worth adding via the `constraint-driven-development`
  skill if the quality bar should be written down rather than implied by CI.
- No E2E (see §3.2).
- No React Compiler. Stable in Next 16 but not enabled in `next.config.ts`;
  would be a cheap win given how much of the tree re-renders.
- Loading states not revisited. Three `loading.tsx` files exist (app root,
  `@modal`, `dashboard`) and all three render a bare `Spinner`. The
  `AdCardSkeleton` components were deleted as dead code, so skeleton loading
  states for the grid would need rebuilding from scratch if wanted.
