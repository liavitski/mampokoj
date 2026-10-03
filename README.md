# MamPokoj — Rental Room Discovery Platform

MamPokoj is a web platform for discovering and managing rental rooms in the
Czech Republic. Visitors browse and paginate through listings; signed-in users
get a dashboard where they can create, edit and delete their own ads and manage
each ad's photos.

Built as a personal project to exercise the full Next.js App Router stack —
server components, server actions, route handlers and ISR-free dynamic
rendering — against a real database and real object storage.

## Features

- Browse rental rooms, newest first, with cursor-based pagination
- Filter by Czech region (14 regions), via sidebar on desktop and a select on mobile
- Ad detail page, plus an intercepting-route modal that opens over the grid
- Sign in with Google
- Dashboard: create, edit and delete your own ads
- Up to 2 ads per account, enforced on the server
- Up to 3 photos per ad, enforced before the upload is stored
- Light and dark themes, persisted in a cookie and applied without a flash
- Responsive from 320px up
- SEO: per-ad Open Graph cards, `schema.org` JSON-LD with price and
  availability, `sitemap.xml`, `robots.txt`, self-referencing canonicals, and
  real HTTP 404s for removed listings
- The interface and all metadata are in Czech; `lang="cs"`

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.3.6 (App Router, Turbopack, React 19.3) |
| Language | TypeScript 5 |
| Database | Postgres (Neon) via Drizzle ORM |
| Auth | NextAuth v4 — Google OAuth |
| File uploads | UploadThing |
| Rate limiting | Upstash Redis |
| Styling | styled-components v6 with an SSR registry |
| Primitives | Radix UI |
| Animation | Motion (Framer Motion) |
| Validation | Zod |
| Tests | Vitest + Testing Library |

## Prerequisites

- **Node.js >= 20.9** (the minimum Next.js 16 supports)
- **pnpm 11.1.3** — pinned in `packageManager`; use `corepack enable` so the
  right version activates automatically. A mismatched global pnpm will fail
  with `ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION`.

## Getting Started

```bash
pnpm install
cp .env .env.local     # then fill it in, see below
pnpm db:migrate        # create the tables
pnpm dev
```

The app runs at http://localhost:3000.

Schema is tracked with checked-in migration files in `drizzle/`. To change it,
edit `src/server/db/schema.ts`, then:

```bash
pnpm db:generate       # writes the SQL into drizzle/
pnpm db:migrate        # applies pending migrations
```

Commit the generated files. CI fails if the schema and the migrations disagree.

`pnpm db:baseline` exists for databases that predate the migration history —
see the note in `src/utils/baseline.tsx`. It is not part of the normal loop.

`pnpm db:push` still exists for a throwaway local database, but it does not
update migration history, so a database touched by it must not be migrated
afterwards. Prefer `db:migrate`.

## Environment Variables

`.env.local` (git-ignored; `.env` is also ignored — never commit either).

**One database, shared by development and production.** The code reads
`DATABASE_URL` and cannot tell environments apart, which is the right shape —
the environments differ only by the value. This is a deliberate choice for a
project with no real users: production keeps showing the seeded listings, so the
site demonstrates itself. The trade-off is that `pnpm db:seed` writes to
production too, and `pnpm db:migrate` migrates production. Both are safe only
while that database holds nothing but generated data. If real users appear, add
a second database rather than relying on that.

**That database is also used by other projects** on the same Neon account, which
is why every table here is prefixed `mampokoj_` and `drizzle.config.tsx` filters
on that prefix — so migrations and `db:push` cannot see anyone else's tables.
Four unprefixed tables remain from abandoned projects; this app neither reads nor
writes them, and they are left alone. See [HANDOFF.md](HANDOFF.md) §8.

Read directly in `src/`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. The app throws on boot without it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Google sign-in | OAuth app credentials |

Read by libraries rather than by name in `src/`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | yes | Signs the session JWT |
| `NEXTAUTH_URL` | yes | Canonical origin, e.g. `http://localhost:3000`. Also the origin every SEO URL is built from — canonicals, `og:url`, `sitemap.xml` and the sitemap pointer in `robots.txt`. It falls back to `VERCEL_URL` (which Vercel provides automatically) so a Preview deployment without this variable cannot advertise production canonicals, and to `http://localhost:3000` last. See `src/lib/seo.tsx`. |
| `UPLOADTHING_TOKEN` | for uploads | Lets the server delete files from the bucket |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | for uploads and ad creation | `Redis.fromEnv()` in `src/server/redis.ts`, shared by the rate limiter and the per-user ad lock. Missing values warn rather than throw, so the client looks healthy and fails on every call. |

Read only by `pnpm db:seed`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SEED_ALLOW` | for `db:seed` | The **database name** that may be filled with fake data, e.g. `SEED_ALLOW=neondb`. |

`pnpm db:seed` refuses to run without it, so CI and a fresh clone cannot seed by
accident. It does **not** stop a seed against production: every env var here is
set **by hand in the Vercel dashboard, per environment** — `.env` is gitignored,
so it does not travel with a push — and `SEED_ALLOW` should be assumed present
there. See `src/utils/seed-guard.ts` and `HANDOFF.md` §1.

OAuth callback URLs are `http://localhost:3000/api/auth/callback/<provider>`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Playwright, 43 specs. Hand-run, not in CI. Kill any stale server on :3000 first |
| `pnpm verify` | lint + typecheck + test + build — run this before pushing |
| `pnpm db:generate` | Write a migration from the schema into `drizzle/` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:baseline` | Record the baseline as applied on a database that predates migrations |
| `pnpm db:push` | Push the schema directly, without recording history |
| `pnpm db:seed` | Insert 100 fake ads and their images (additive — run it twice if you wiped the table) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm storage:reconcile` | Report (and with `--delete` remove) upload-bucket files no database row references |

## Testing

```bash
pnpm test
```

253 tests across 28 files, using Vitest with Testing Library. Tests live in
`__tests__` folders next to the code they cover, mirroring the source tree.

Two conventions are worth knowing before adding tests:

- **Server-side test files open with `// @vitest-environment node`.** The
  default environment is jsdom, for component tests.
- **Authorization is asserted against compiled SQL, not against mock
  behaviour.** Ownership lives in the query predicate, so a mock that returns
  "no row" would pass even with the check removed. `src/test/drizzle-where.ts`
  compiles a `where` clause with Drizzle's `PgDialect` so a test can assert on
  the SQL text and bound parameters. See `src/lib/__tests__/ads.test.ts`.

**There is an end-to-end suite, and it is run by hand rather than in CI.**
`pnpm test:e2e` runs 43 Playwright specs in `e2e/` covering browse → region filter
→ load more → ad detail → intercepting modal → not-found → SEO. Every spec is an
anonymous read, so it is safe against the shared development database, and that
same constraint is why the ad limit, the report predicate and the moderation
takedown have no E2E coverage — they need a signed-in session and a disposable
database. See [HANDOFF.md](HANDOFF.md) §2.1.

## Project Structure

```
src/
  app/                    routes
    page.tsx              ad grid, region filter
    ad/[adId]/            ad detail
    @modal/(.)ad/[adId]/  intercepting route: detail as a modal
    dashboard/[userId]/   owner-only CRUD
    api/ads/              public paginated ad feed
    api/uploadthing/      upload route + config
    api/auth/[...nextauth]/
  components/             UI, one folder per component
  lib/                    session, ad ownership, validation, DTO mapping
  server/
    actions/              server actions (mutations)
    queries/select.tsx    reads
    upload-guard.ts       pre-upload admission checks
    storage.ts            UploadThing server SDK
    db/                   drizzle client + schema
  types/                  shared types
  test/                   test helpers
```

## Architecture Notes

**Ownership is enforced in the query, not after the read.** Every mutation
resolves the owner from the session and puts it in the `WHERE` clause, via
`findAdOwnedByCurrentUser` in `src/lib/ads.ts`. "Not yours" and "does not
exist" deliberately collapse into the same answer so responses cannot be used
to enumerate ad ids.

**The session is read once per request.** `src/lib/session.ts` wraps
`getServerSession` in React's `cache()`, so the layout, header and every card
share one read.

**Public payloads are allowlisted twice.** The list query selects an explicit
column set, and `toPublicAd` in `src/lib/ad-dto.ts` rebuilds the response field
by field. The ad's `userId` and `contactPhone`, and each photo's `fileKey`, are
never sent to the browser. Fields are listed rather than omitted so that adding
a column to the schema does not silently publish it.

**Input is validated on the server.** `src/lib/validation/ad-schema.ts` mirrors
the database column constraints. The `maxlength` attributes in the forms are a
convenience, not the enforcement.

**Uploads are admitted before bytes move.** `checkUploadAdmission` settles
ownership, the rate limit and the photo count in the UploadThing middleware.
Checking in `onUploadComplete` instead would mean paying to store a file that
is then rejected.

## Deployment

Deployed on Vercel. Three things to know:

- `sharp` is deliberately **not** built (`pnpm-workspace.yaml`), since Vercel
  provides it for `next/image` optimization. Self-hosting would need it.
- `pnpm-workspace.yaml` also sets `allowBuilds`, which controls which
  dependencies may run install scripts. It is not a workspace definition —
  this is a single-package repo.
- **Schema is not applied on deploy.** Run `pnpm db:migrate` as a release step.
  Since development and production share a database, that migrates production.
  It has been baselined already, so there is no `db:baseline` step to do.

## Screenshots

### Main Page

![Main Page](https://github.com/liavitski/mampokoj/blob/main/public/docs/main_page.jpg)

### Main Page Flow

![Main Page basic flow](https://github.com/liavitski/mampokoj/blob/main/public/docs/main_basic_flow.jpg)

### User Dashboard

![User dashboard](https://github.com/liavitski/mampokoj/blob/main/public/docs/dashboard_user.jpg)

### Delete Image Flow (Dashboard)

![Delete Image flow](https://github.com/liavitski/mampokoj/blob/main/public/docs/dashboard_delete_photo.jpg)

### Mobile View

![Mobile View main page](https://github.com/liavitski/mampokoj/blob/main/public/docs/main_page_mobile.jpg)

## Purpose

The project demonstrates a clean and user-friendly interface for rental room
browsing and management, focusing on usability and responsive design.

## License

This project is proprietary. See the [LICENSE](LICENSE) file for details.
