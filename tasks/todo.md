# Tasks: Ad reporting and moderation triage

Plan: `tasks/plan.md` · Spec: `SPEC-moderation.md` · Handoff: `HANDOFF.md`

**Status: shipped and verified in a real browser.** `pnpm verify` green — 361
tests across 42 files, lint 0 warnings, `tsc` clean, build clean.

Everything below the divider is done and kept for reference. Above it is the
only open work.

---

# OPEN: the bucket half of checks 3 and 4 could not be verified

The five browser checks were run on 2026-10-03 with Playwright driving a real
Chrome and a real Google sign-in. Four passed outright; the fifth passed except
for the part that was never possible to test. Details below.

- [x] **Restart `pnpm dev`.** The running server had started at 11:26; `.env`
      was last written at 12:34, so `MODERATORS` genuinely was not loaded.
      Restarted and confirmed via `next dev`'s `Environments: .env` line.
- [x] **`/moderation` lists the reported ads.** Rendered **6 rows** for the
      moderator, each with a `tel:` link and a "Take down" button. Ordering
      checked against the database, not just against the page: `getReportedAds`
      returned the same six ids in the same `reportedAt DESC` order. The
      anonymous refusal path still refuses.
- [x] **Take one down.** `deleteAdAsModerator` ran live for
      `044ef7a4` ("Krátkodobý pronájem pokoje"). Row gone, image row cascaded
      away with it, queue went 6 → 5, and `/ad/044ef7a4` now renders
      **"404 - Page Not Found"**. `ConfirmDialog` appeared with "Yes, take it
      down" / Cancel before anything was deleted.
- [x] **Delete one of the owner's own ads.** `deleteAdById` ran live for
      `227f7b25`; dashboard shows "You dont have any ads." Both callers of the
      extracted `teardownAd` therefore work against a real session.
- [x] **Dashboard still shows the ad limit as 2.** "Maximum 2 ads per user"
      with one ad held. The slot index is unaffected by dropping GitHub.

- [ ] **Verify `utapi.deleteFiles` removes a real file.** Still open, and it is
      a data problem rather than a code one — see below.

## Why the bucket check could not be run

Checks 3 and 4 each said "its photos should leave the UploadThing bucket". That
half is **unverifiable against the current database**, for a reason already
predicted in `HANDOFF.md` §3:

- `utapi.listFiles` over the live bucket returns **0 files**.
- All **394** image rows carry a `seeded-<uuid>` key. Every one is synthetic
  and none was ever uploaded, so there is nothing for a delete to remove.
- The owner's own ad had **0** image rows at all, so deleting it could not
  exercise the file path even in principle.

So `teardownAd` ran live on both paths and deleted its rows correctly, but the
`utapi.deleteFiles` call inside it only ever received keys that were never in
the bucket. It did not error, which is weak evidence the call shape is right —
a wrong key would also not error.

To close this, upload one real photo to a real ad and delete that ad, then
confirm `utapi.listFiles` drops to 0 again. That is the only honest way to prove
the bucket half works. Worth doing before any real landlord uses this.

## A bug found while checking: the queue does not refresh after a takedown

After confirming "Yes, take it down", the page **still showed all 6 rows**
including the ad just deleted. The database was correct immediately; only the
rendered list was stale. A reload showed the right 5.

`TakeDownButton` calls the action and never calls `router.refresh()`, and the
moderation page's list is not otherwise revalidated, so a moderator taking down
two ads in a row gets no feedback on the first. The ad row stays in the queue
until they reload, which reads as "the takedown did not work".

## If `/moderation` refuses anyway

Almost always `MODERATORS`. It takes **OAuth account ids**, not email addresses
— `YOUR_OAUTH_ACCOUNT_ID`, the same value as `/dashboard/<userId>`. The
allowlist fails closed, so a wrong value produces no error anywhere: the page
simply refuses. See `HANDOFF.md` §1.

## Still open, and the maintainer's call — not started

- [ ] **Fix the stale queue after a takedown** (`router.refresh()`, or
      `revalidatePath` in the action). Found by the browser check above; not
      fixed, because the checks were meant to be verification only.
- [ ] **§2.2 — the E2E decision.** (a) a Neon branch per CI run, (b) a
      `postgres` service container needing a driver swap behind an env check,
      (c) local-only Playwright run by hand. Priority order once chosen: browse →
      region filter → load more → ad detail → intercepting modal → 404 for a
      deleted ad. Anonymous flows only.

      **Partly de-risked.** A Playwright MCP server is configured, so a browser
      can be driven against a running dev server without writing test files —
      which is how the five checks above were done. It is *not* option (c):
      there is no committed suite and nothing in CI. MCP gave manual
      verification, not coverage.
- [ ] **§9.2 — retiring `withUserLock`.** Would delete `user-lock.ts`,
      `user-lock.test.ts`, `redis-client-contract.test.ts` and close §2.1 and
      §9.4 with it. Left alone deliberately: it removes a deliberately
      engineered module whose Lua release script has an open verification item.
- [ ] **Migrate `DeleteAdButton` onto `ConfirmDialog`.** Not needed, so not done
      while it was the risky path. It is the last duplicated dialog in the app.

---

# Done

<details>
<summary>Phase 1 — data foundation</summary>

- [x] `reportedAt` nullable, no default, partial index `WHERE ... IS NOT NULL`
- [x] `PublicAd` and `AdWithoutUserId` both omit it; `detailAdColumns` keeps it
      out of the RSC payload (found unplanned — see `plan.md` deviations)
- [x] Migration `drizzle/0002_rapid_earthquake.sql` generated and committed
- [x] Migration assertions added for the `ADD COLUMN` and the partial predicate
- [x] Verified on a **scratch** database: 3 migrations replayed from zero,
      column nullable, index partial, `.returning()` works over neon-http,
      two concurrent reports wrote `[1, 0]`, queue plans as `Index Scan Backward`
- [x] **Applied to the shared database** after it broke development — see the
      incident in `plan.md`
</details>

<details>
<summary>Phase 2 — a signed-in visitor can report an ad</summary>

- [x] `reportAd` — one atomic statement, first report wins, self-report refused
- [x] Compiled-SQL assertions for both predicates, each proved by reverting it:
      dropping `isNull` fails one test, dropping `ne` fails two
- [x] `ReportButton` — role+name query, disabled while pending, toasts both ways,
      disabled "Reported" state after success
- [x] Wired into `AdCardCompact`, signed-in only, inside `InfoWrapper`, with its
      own grid area (a sixth row track added alongside)
- [x] **Verified in a real signed-in browser by the maintainer:** report → toast,
      second report refused, own ad refused
- [x] `curl` confirms no `reportedAt` in the ad page or `/api/ads`
</details>

<details>
<summary>Phase 3 — a moderator can triage and take down</summary>

- [x] `moderator-guard` — pure, fails closed, trims, drops empty entries
- [x] `ad-teardown` extracted; order asserted, and reverting it fails 2 tests
- [x] `deleteAdAsModerator` — the only ownership bypass in the codebase;
      **removing the gate fails 4 tests**
- [x] `getReportedAds` — `IS NOT NULL`, newest first, selects `contactPhone` and
      `userId`, bounded, no images join; predicate proved by reverting
- [x] `/moderation` — gate **before** the query; moving it after fails the
      ordering test
- [x] `ConfirmDialog` extracted rather than copied (unplanned, see `plan.md`)
- [x] Verified against the real database: queue rows carry a `Date` and a phone,
      ordering newest-first confirmed
- [x] `/moderation` refusal verified in a real browser
</details>

<details>
<summary>Phase 4 — one provider, and the handoff</summary>

- [x] GitHub dropped; `authOptions` pinned to one provider by test
- [x] Dead `GITHUB_*` removed from `.env`; 3 README lines corrected
- [x] `HANDOFF.md` — §9.3 closed, §9.5's two-identities item closed, `MODERATORS`
      trap in §1, four "looks like a mistake" decisions in §3, the deploy-ordering
      trap in §4
</details>

## Data note

The six reported rows in the shared database were the maintainer's own manual
tests. **The browser checks consumed two of them**: the takedown deleted
`044ef7a4` outright, and the owner's own ad `227f7b25` is gone. Five reported
rows remain, and the owner now holds **0 of their 2 ad slots** — so the queue
still has data to work with, and the ad limit can be re-tested by posting
another ad. Total ads went 201 → 200.

To restore, re-report an ad from its detail page. **Never an unscoped delete**
(`HANDOFF.md` §5).
