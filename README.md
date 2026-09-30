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
- Sign in with GitHub or Google
- Dashboard: create, edit and delete your own ads
- Up to 2 ads per account, enforced on the server
- Up to 3 photos per ad, enforced before the upload is stored
- Light and dark themes, persisted in a cookie and applied without a flash
- Responsive from 320px up

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.3.6 (App Router, Turbopack, React 19.3) |
| Language | TypeScript 5 |
| Database | Postgres (Neon) via Drizzle ORM |
| Auth | NextAuth v4 — GitHub + Google OAuth |
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

**Two databases.** Development and production are separate databases, and the
code cannot tell them apart — it reads `DATABASE_URL` and nothing else. Local
work uses your development database; Vercel supplies production's value through
its own environment variables. Set them in different places, not in one file
that gets copied around.

Read directly in `src/`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. The app throws on boot without it. |
| `GITHUB_ID` / `GITHUB_SECRET` | for GitHub sign-in | OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Google sign-in | OAuth app credentials |

Read by libraries rather than by name in `src/`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | yes | Signs the session JWT |
| `NEXTAUTH_URL` | yes | Canonical origin, e.g. `http://localhost:3000` |
| `UPLOADTHING_TOKEN` | for uploads | Lets the server delete files from the bucket |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | for uploads and ad creation | `Redis.fromEnv()` in `src/server/redis.ts`, shared by the rate limiter and the per-user ad lock. Missing values warn rather than throw, so the client looks healthy and fails on every call. |

Read only by `pnpm db:seed`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SEED_ALLOW` | for `db:seed` | The **database name** that may be filled with fake data, e.g. `SEED_ALLOW=neondb`. |

`pnpm db:seed` refuses to run without it. It is pinned to a database name rather
than a boolean on purpose: a truthy flag would sail through in production,
whereas a production database's name will not match a development one. See
`src/utils/seed-guard.ts`.

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
| `pnpm verify` | lint + typecheck + test + build — run this before pushing |
| `pnpm db:generate` | Write a migration from the schema into `drizzle/` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:baseline` | Record the baseline as applied on a database that predates migrations |
| `pnpm db:push` | Push the schema directly, without recording history |
| `pnpm db:seed` | Insert 100 fake ads and their images |
| `pnpm db:studio` | Drizzle Studio |

## Testing

```bash
pnpm test
```

135 tests across 17 files, using Vitest with Testing Library. Tests live in
`__tests__` folders next to the code they cover, mirroring the source tree.

Two conventions are worth knowing before adding tests:

- **Server-side test files open with `// @vitest-environment node`.** The
  default environment is jsdom, for component tests.
- **Authorization is asserted against compiled SQL, not against mock
  behaviour.** Ownership lives in the query predicate, so a mock that returns
  "no row" would pass even with the check removed. `src/test/drizzle-where.ts`
  compiles a `where` clause with Drizzle's `PgDialect` so a test can assert on
  the SQL text and bound parameters. See `src/lib/__tests__/ads.test.ts`.

There is no end-to-end suite yet — see [HANDOFF.md](HANDOFF.md).

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

Deployed on Vercel. Two things to know:

- `sharp` is deliberately **not** built (`pnpm-workspace.yaml`), since Vercel
  provides it for `next/image` optimization. Self-hosting would need it.
- `pnpm-workspace.yaml` also sets `allowBuilds`, which controls which
  dependencies may run install scripts. It is not a workspace definition —
  this is a single-package repo.
- **Schema is not applied on deploy.** Run `pnpm db:migrate` against the
  production database as a release step. Until that happens, production schema
  is whatever was last pushed there by hand.
- If the production database predates the migration history, run
  `pnpm db:baseline` against it once before the first `db:migrate`.

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
