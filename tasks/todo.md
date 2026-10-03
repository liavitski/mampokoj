# Tasks: Ad reporting and moderation triage

Plan: `tasks/plan.md` · Spec: `SPEC-moderation.md` · Handoff: `HANDOFF.md`

**Status: shipped.** `pnpm verify` green — 361 tests across 42 files, lint 0
warnings, `tsc` clean, build clean. Tree clean at `dbd093e`.

Everything below the divider is done and kept for reference. Above it is the
only open work.

---

# OPEN: five checks that need a browser

None of these can be done headlessly, and none is a code change. Every test
mocks `requireUserId` and `utapi.deleteFiles`, so the session path and the
bucket path have never run live.

- [ ] **Restart `pnpm dev`.** `.env` is loaded when the server boots, so the
      `MODERATORS` value set during implementation is not in the running process
      yet. Skipping this makes everything below look broken.
- [ ] **`/moderation` lists the six reported ads.** Restart first, then open
      `/moderation`. `MODERATORS` is set to the owner's account id. Expect six
      rows, newest first, each with a phone number and a "Take down" button.
      *Partially verified:* the **refusal** path is confirmed in a real browser —
      anonymous gets `Not allowed.`, no error overlay, zero `tel:` links. The
      listed view has never rendered.
- [ ] **Take one down.** It should disappear from the queue, the ad should 404,
      and its photos should leave the UploadThing bucket. This is the first live
      call to `utapi.deleteFiles` through `teardownAd`.
- [ ] **Delete one of the owner's own ads.** Same bucket check, through the
      owner path, to confirm the extracted teardown behaves for both callers.
- [ ] **Confirm the dashboard still shows the ad limit as 2.** Dropping GitHub
      changed the identity model (§9.5); the slot index should be unaffected,
      but it is the thing that would be wrong if it were not.

## If `/moderation` refuses anyway

Almost always `MODERATORS`. It takes **OAuth account ids**, not email addresses
— `YOUR_OAUTH_ACCOUNT_ID`, the same value as `/dashboard/<userId>`. The
allowlist fails closed, so a wrong value produces no error anywhere: the page
simply refuses. See `HANDOFF.md` §1.

## Still open, and the maintainer's call — not started

- [ ] **§2.2 — the E2E decision.** (a) a Neon branch per CI run, (b) a
      `postgres` service container needing a driver swap behind an env check,
      (c) local-only Playwright run by hand. Priority order once chosen: browse →
      region filter → load more → ad detail → intercepting modal → 404 for a
      deleted ad. Anonymous flows only.
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

The six reported rows in the shared database are the maintainer's own manual
tests, deliberately left in place — they give the queue real data to try the
takedown against. Clear with a scoped `UPDATE ... SET "reportedAt" = NULL` if
they get in the way. **Never an unscoped delete** (`HANDOFF.md` §5).
