# Tasks: Ad reporting and moderation triage

Plan: `tasks/plan.md` · Spec: `SPEC-moderation.md` · Baseline: 277 tests, green.

Two shippable vertical slices. Phase 1 is the data foundation both depend on.

Every task follows TDD: write the test, watch it fail, then implement.
For authorization, the test must be proven by **deleting the predicate and
confirming the failure** before it is believed (HANDOFF §5).

---

## Phase 1: Data foundation

## Task 1: Add `reportedAt` and its partial index

**Description:** Add a nullable `reportedAt` timestamp to `ads` with a doc comment
explaining first-report-wins and its privacy, plus a partial index
`mampokoj_ads_reported_idx` on `("reportedAt") WHERE "reportedAt" IS NOT NULL`.
Add `'reportedAt'` to `PublicAd`'s `Omit` in `src/types/db-types.tsx` so the
column cannot reach the public payload by accident. Generate the migration with
`pnpm db:generate` and commit it. Extend `migrations.test.ts` to assert the
`ADD COLUMN` and the **partial** predicate explicitly — a plain index would
satisfy the existing `toContain('CREATE')` assertion while being the wrong shape.

**Acceptance criteria:**
- [ ] `schema.ts` declares `reportedAt` nullable with no default, and a partial index whose `where` is `IS NOT NULL`
- [ ] `PublicAd`'s `Omit` includes `'reportedAt'`; `toPublicAd` is unchanged
- [ ] `pnpm db:generate` produces a migration, and `git diff --exit-code` is clean afterwards (CI's check)
- [ ] `migrations.test.ts` asserts both the `ADD COLUMN` and the `WHERE "reportedAt" IS NOT NULL` clause
- [ ] `pnpm typecheck` passes — `PublicAd` must still compile with the extra column omitted

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Migration generated: `pnpm db:generate && git status --short` shows a new `.sql` plus journal/snapshot updates
- [ ] Build: `pnpm build`
- [ ] Manual: read the generated SQL and confirm it is exactly one `ALTER TABLE ... ADD COLUMN` and one `CREATE INDEX`, with no `DROP` and no data change

**Dependencies:** None
**Files:** `src/server/db/schema.ts`, `src/types/db-types.tsx`, `drizzle/*`, `src/utils/__tests__/migrations.test.ts`
**Scope:** S

## Task 2: Verify the migration against a real scratch database

**Description:** Prove the migration applies rather than assuming it. §1 confirms
Postgres is reachable and `CREATE DATABASE` is permitted. Create a scratch
database, migrate onto it, confirm the column and the partial index exist, then
drop it — terminating idle sessions first, because the connection uses the
`-pooler` host and those sessions outlive the process.

This task exists because a generated migration that has never been applied is a
claim, not a fact, and because `.returning()` over neon-http is an assumption
Task 3 depends on.

**Acceptance criteria:**
- [ ] A scratch database is created, `db:migrate` runs clean against it, and the migration ledger holds both rows
- [ ] `"reportedAt"` exists on `mampokoj_ads` and is nullable
- [ ] `mampokoj_ads_reported_idx` exists **and its definition contains `WHERE "reportedAt" IS NOT NULL`**
- [ ] The scratch database is dropped, after `pg_terminate_backend` on its idle sessions
- [ ] The shared dev/prod database was **not** migrated as part of this work

**Verification:**
- [ ] Query `information_schema.columns` and `pg_indexes` on the scratch DB and paste the output
- [ ] `SELECT count(*) FROM mampokoj_ads` on the shared database still returns 201 — the untouched baseline
- [ ] Manual: confirm `drizzle/0002_*.sql` was not applied to `neondb` by checking the shared ledger still has exactly two rows

**Dependencies:** Task 1
**Files:** none committed (scratch verification only; findings go in the Task 1 test assertions)
**Scope:** S

---

## Checkpoint: Foundation

- [ ] `pnpm verify` green — lint 0 warnings, `tsc` clean, 277 tests + new ones, build succeeds
- [ ] Migration applied to a real scratch database; column and partial index confirmed
- [ ] Shared dev/prod database untouched, still 201 seeded ads
- [ ] **Review with human before proceeding**

---

## Phase 2: Slice A — a signed-in visitor can report an ad

## Task 3: `reportAd` server action

**Description:** `src/server/actions/reportAd.tsx`, `'use server'`. Authenticate
with `requireUserId()`; validate the id through the existing `adIdSchema`; then
one atomic `db.update(ads).set({ reportedAt: new Date() }).where(and(eq(id),
isNull(reportedAt), ne(userId, userId))).returning({ id })`. Zero rows means
already-reported, own ad, or nonexistent — all one message. Return
`CreateAdResult`-style discriminated union. A thrown driver error logs and
returns a generic message, never the raw one.

Tests assert against **compiled SQL** via `src/test/drizzle-where.ts`, and each is
proven by removing the predicate and confirming the failure.

**Acceptance criteria:**
- [ ] Signed out → `{ success: false, error: 'Unauthorized' }` and **no update issued at all**
- [ ] One row written → `{ success: true }`
- [ ] Zero rows → `{ success: false }`, no throw, single undifferentiated message
- [ ] The predicate compiles to SQL constraining `"reportedAt"` with `IS NULL`
- [ ] The predicate compiles to SQL constraining `"userId"`, excluding the reporter
- [ ] A thrown driver error returns a generic message; the raw message is not in it; `console.error` was called
- [ ] **Revert check:** removing `isNull` fails the first SQL test; removing `ne` fails the second
- [ ] A test pins that this write bumps `updatedAt` (`SPEC-moderation.md` §8.1), so it stays a recorded decision

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Build: `pnpm build`
- [ ] Manual: none yet — the button does not exist until Task 5. Confirm by calling the action from a temporary route only if the test suite cannot prove it.

**Dependencies:** Task 1 (proves `.returning()`), Task 2
**Files:** `src/server/actions/reportAd.tsx`, `src/server/actions/__tests__/reportAd.test.ts`
**Scope:** M

## Task 4: `ReportButton` client component

**Description:** `src/components/ReportButton/ReportButton.tsx`, `'use client'`,
following `DeleteAdButton` (toast + `isPending`, no navigation) and
`BlurredPhone` (a client child extracted so an async Server Component can render
it). Renders a real `<button>` with an accessible name, calls the action with
the ad id, disables while pending.

**Acceptance criteria:**
- [ ] Renders a `button` with an accessible name, found by role+name query
- [ ] One click calls `reportAd` with the ad id exactly once
- [ ] Disabled while pending, so a double click cannot file two reports
- [ ] Success and failure each surface a toast
- [ ] `'use client'` at the top — no `styled.*` or handlers outside it (§4 trap)

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Build: `pnpm build`
- [ ] Manual: covered by Task 5's checkpoint

**Dependencies:** Task 3
**Files:** `src/components/ReportButton/ReportButton.tsx`, `src/components/ReportButton/__tests__/ReportButton.test.tsx`
**Scope:** M

## Task 5: Wire the button into `AdCardCompact`

**Description:** Render `{currentUser && <ReportButton adId={ad.id} />}` inside
`InfoWrapper` — so it inherits the `[data-modal-box]` styling branch, and appears
in both the detail page and the intercepting modal. Not on `AdSummaryCard`, which
is `'use client'` inside a full-card `<Link>` and would nest an interactive
element ten times per page. Add an explicit assertion that `reportedAt` is absent
from `PublicAd`, naming what it catches.

**Acceptance criteria:**
- [ ] The button renders for a signed-in visitor on the detail page and in the intercepting modal
- [ ] No button renders for an anonymous visitor
- [ ] `getComputedStyle` check confirms the button sits inside the modal box and is not clipped
- [ ] `ad-dto.test.ts` asserts `reportedAt` is **absent** from `Object.keys(toPublicAd(FULL_ROW))`
- [ ] `toPublicAd` itself is unmodified

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Build: `pnpm build`
- [ ] Manual: `pnpm dev` → sign in → open an ad → report it → confirm the toast and the button's pending state; open it via a grid click to confirm the modal copy; sign out → confirm no button
- [ ] Manual: `curl` the ad detail page and confirm `"reportedAt"` appears in no `<script>` payload

**Dependencies:** Tasks 3, 4
**Files:** `src/components/AdCard/AdCardCompact.tsx`, `src/lib/__tests__/ad-dto.test.ts`
**Scope:** S

---

## Checkpoint: Slice A

- [ ] `pnpm verify` green
- [ ] Every `reportAd` authorization test **fails** when its predicate is removed
- [ ] Manual: sign in, report an ad, see the toast; sign out, see no button
- [ ] `reportedAt` confirmed absent from the public payload and the rendered grid
- [ ] **Review with human before proceeding** — this slice is independently shippable

---

## Phase 3: Slice B — a moderator can triage and take down

## Task 6: `moderator-guard`

**Description:** `src/lib/moderator-guard.ts` — `parseModeratorAllowlist(raw)` and
`isModerator(userId, allowlist)`. Pure: no `server-only`, no database import, so
the rule is testable without a connection, mirroring `src/utils/seed-guard.ts`.
Fails closed. Not `'use server'`, which would publish its exports as remotely
callable endpoints (`src/lib/session.ts` documents that).

**Acceptance criteria:**
- [ ] Unset, empty, whitespace-only and `"a, ,b,"` all parse to the expected set
- [ ] `isModerator(null, allowlistContainingEmptyString)` is `false`
- [ ] An empty allowlist makes no `userId` a moderator
- [ ] A member is `true`, a non-member is `false`

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Typecheck: `pnpm typecheck`
- [ ] Manual: none — pure function

**Dependencies:** None (independent of Task 1)
**Files:** `src/lib/moderator-guard.ts`, `src/lib/__tests__/moderator-guard.test.ts`
**Scope:** S

## Task 7: Extract `ad-teardown`, refactor `deleteAd`

**Description:** `src/server/ad-teardown.ts` holding `teardownAd(adId)`: read
`fileKey`s, delete UploadThing files, delete image rows, delete the ad row — in
that order. `deleteAdById` keeps its ownership check **byte-for-byte** and swaps
its body for the call. The caller decides *whether*; teardown never re-checks.

**Acceptance criteria:**
- [ ] `teardownAd` performs the four steps in that order
- [ ] `utapi.deleteFiles` is not called when the ad has no images
- [ ] `deleteAdById`'s ownership check, refusal message and return shape are unchanged
- [ ] `deleteAd.test.ts` stays green, unmodified in intent
- [ ] A test asserts the **order** — deleting rows before reading `fileKey`s orphans real paid storage (§2.3)

**Verification:**
- [ ] Tests: `pnpm test` — `deleteAd.test.ts` in particular
- [ ] Build: `pnpm build`
- [ ] Manual: `pnpm dev` → delete an owned ad → confirm its photos leave the bucket

**Dependencies:** None
**Files:** `src/server/ad-teardown.ts`, `src/server/actions/deleteAd.tsx`, `src/server/actions/__tests__/deleteAd.test.ts`
**Scope:** M

## Task 8: `deleteAdAsModerator`

**Description:** `src/server/actions/deleteAdAsModerator.tsx`, `'use server'`.
Gate on `isModerator(await requireUserId(), parseModeratorAllowlist(process.env.MODERATORS))`
before anything else; then look the ad up **without** an ownership predicate and
call `teardownAd`. This is the only place ownership is bypassed.

The central test asserts a non-moderator triggers **no** storage write, and is
proven by deleting the allowlist check and confirming it fails.

**Acceptance criteria:**
- [ ] Non-moderator → refusal, and `utapi.deleteFiles` and both `db.delete` calls are **not** invoked
- [ ] Non-moderator never surfaces whether the ad exists
- [ ] Moderator → teardown runs, files and rows removed
- [ ] `compileWhere` shows the lookup is **not** constrained by `"userId"` — this is what distinguishes it from `deleteAdById` at the SQL level rather than by name
- [ ] Teardown throws → generic error, `console.error` called
- [ ] **Revert check:** deleting the `isModerator` call fails the non-moderator test
- [ ] `deleteAdById` still rejects a non-owner

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Build: `pnpm build`
- [ ] Manual: with `MODERATORS` unset, call the action and confirm nothing is deleted; set it to your account id and confirm it works

**Dependencies:** Tasks 6, 7
**Files:** `src/server/actions/deleteAdAsModerator.tsx`, `src/server/actions/__tests__/deleteAdAsModerator.test.ts`
**Scope:** M

## Task 9: `getReportedAds`

**Description:** In `src/server/queries/select.tsx`. `WHERE "reportedAt" IS NOT
NULL`, ordered `reportedAt` descending, bounded — mirroring `getUserAds`'s
on-principle limit. Columns **include** `userId`, `contactPhone` and
`reportedAt`: a moderator needs to know whose ad it is and whose phone number is
being scammed. Must not reuse `publicAdColumns`, which would silently drop the
phone number — the exact field the report is about.

**Acceptance criteria:**
- [ ] Compiled SQL constrains `"reportedAt"` with `IS NOT NULL`
- [ ] **Revert check:** dropping the predicate fails the test — otherwise it returns all 201 seeded ads
- [ ] Ordered by `reportedAt` descending
- [ ] Selected columns include `userId`, `contactPhone`, `reportedAt`
- [ ] The read is bounded, with a comment saying why

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Typecheck: `pnpm typecheck`
- [ ] Manual: none — no UI yet

**Dependencies:** Task 1
**Files:** `src/server/queries/select.tsx`, `src/server/__tests__/select.reported.test.ts`
**Scope:** S

## Task 10: `/moderation` page

**Description:** `src/app/moderation/page.tsx`. Gate on `isModerator` **before**
calling `getReportedAds` — the `canViewDashboard` precedent in
`src/app/dashboard/[userId]/page.tsx:26-30`, and that ordering is the entire
protection. Render `<h3>Not allowed.</h3>` on refusal, per the app's one existing
convention. List reported ads with a take-down button calling
`deleteAdAsModerator`, following `DeleteAdButton`.

Testing an async Server Component follows the repo's precedent: the predicate is
tested directly in Task 6, and a source-read test asserts the gate precedes the
query.

**Acceptance criteria:**
- [ ] The gate appears **before** `getReportedAds` in the source
- [ ] **Revert check:** moving the query above the check fails the test
- [ ] Non-moderator sees `<h3>Not allowed.</h3>`, and no query runs
- [ ] Reports are listed newest-first with title, phone and report time
- [ ] Take-down removes the row from the list without a full page reload
- [ ] The route builds and appears as `ƒ /moderation` in `next build` output

**Verification:**
- [ ] Tests: `pnpm test`
- [ ] Build: `pnpm build` — confirm the new route is listed as dynamic
- [ ] Manual: `pnpm dev` with `MODERATORS` set and unset → `/moderation` lists and refuses respectively; take down a reported ad and confirm it 404s and its photos leave the bucket

**Dependencies:** Tasks 6, 8, 9
**Files:** `src/app/moderation/page.tsx`, `src/components/moderation/*`, `src/__tests__/moderation-gate.test.ts`
**Scope:** M

---

## Checkpoint: Slice B

- [ ] `pnpm verify` green
- [ ] The takedown test **fails** when the allowlist check is removed
- [ ] The moderation gate test **fails** when moved after the query
- [ ] Manual: a moderator lists a reported ad, takes it down, it 404s and its photos leave the bucket
- [ ] Non-moderator cannot list or delete anything
- [ ] **Review with human before proceeding**

---

## Phase 4: Close out

## Task 11: Update `HANDOFF.md`

**Description:** Record what changed so the next session inherits facts, not
guesswork, per the file's own preamble. §9.3 becomes resolved. Add the new
decisions that look like mistakes: the moderator bypass is deliberate and lives
in exactly one action; `reportedAt` staying private is deliberate; no rate limit
on `reportAd` follows §9.2's reasoning; reporting bumps `updatedAt`. Note the
`MODERATORS` env var in §1 and that it is set in production because `.env`
travels to the Vercel host. Leave §9.2 and §2.2 **unchanged** — both are still
open and still yours.

**Acceptance criteria:**
- [ ] §9.3 marked resolved, with the four non-obvious decisions recorded
- [ ] `MODERATORS` documented in §1 alongside `SEED_ALLOW`, including that it is not a secret
- [ ] §9.2 and §2.2 are not altered
- [ ] No claim in the file is unverified — every new statement traces to a passing test or the scratch-DB output

**Verification:**
- [ ] Manual: read the diff against `HEAD` and confirm every new sentence is backed by a test that fails without the fix
- [ ] Tests: `pnpm verify`

**Dependencies:** Tasks 1–10
**Files:** `HANDOFF.md`
**Scope:** S

---

## Checkpoint: Complete

- [ ] All 10 success criteria in `SPEC-moderation.md` §7 hold
- [ ] `pnpm verify` green
- [ ] No pre-existing test weakened, deleted, or made unreachable
- [ ] `git diff --exit-code` after `pnpm db:generate` — CI's migration check passes
- [ ] Ready for review
