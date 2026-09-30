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
pnpm db:push           # create the tables
pnpm dev
```

The app runs at http://localhost:3000.

This project uses `drizzle-kit push` rather than checked-in migration files —
there is no `drizzle/` directory, so schema changes are pushed directly.

## Environment Variables

`.env.local` (git-ignored; `.env` is also ignored — never commit either).

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
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | for uploads | `Redis.fromEnv()` in `src/server/ratelimit.ts` |

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
| `pnpm db:push` | Push the schema to the database |
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
