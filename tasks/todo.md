# Tasks: Ad reporting and moderation triage

Plan: `tasks/plan.md` · Spec: `SPEC-moderation.md` · Handoff: `HANDOFF.md`

**Status: shipped and verified in a real browser.** `pnpm verify` green — 361
tests across 42 files, lint 0 warnings, `tsc` clean, build clean.

Everything below the divider is done and kept for reference. Above it is the
only open work.

---

# OPEN: two items, one of them needing your decision

The five browser checks were run on 2026-10-03 with Playwright driving a real
Chrome and a real Google sign-in, and the one half that could not be tested then
was retested afterwards once Redis turned out to be reachable. Everything that
was open is now closed. What remains is below.

- [x] **Restart `pnpm dev`.** The running server had started at 11:26; `.env`
      was last written at 12:34, so `MODERATORS` genuinely was not loaded.
      Restarted and confirmed via `next dev`'s `Environments: .env` line.
- [x] **`/moderation` lists the reported ads.** Rendered **6 rows** for the
      moderator, each with a `tel:` link and a "Take down" button. Ordering
      checked against the database, not just against the page.
- [x] **Take one down.** `deleteAdAsModerator` ran live for `044ef7a4`. Row
      gone, queue 6 → 5, `/ad/044ef7a4` renders "404 - Page Not Found".
- [x] **Delete one of the owner's own ads.** `deleteAdById` ran live for
      `227f7b25`. Both callers of the extracted `teardownAd` work against a
      real session.
- [x] **Dashboard still shows the ad limit as 2.** The slot index is unaffected
      by dropping GitHub.
- [x] **`utapi.deleteFiles` removes a real file.** Retested once Redis was
      reachable and uploads worked. Precondition measured first — 1 real file in
      the bucket, non-`seeded-*` key, matching image row — then the ad was
      deleted and all four results asserted: bucket back to 0, ad row gone,
      image row gone, `/ad/[adId]` 404s. `storage:reconcile` reports no drift.
- [x] **The queue refreshes after a takedown.** Fixed, with a test proved by
      reverting it. See below.
- [x] **The Lua release script executes correctly.** Run against live Redis,
      8/8 checks passed, including that a stale holder cannot delete a lock
      somebody else now holds. `HANDOFF.md` §2.1.

## Two things found along the way, both fixed

**The queue did not refresh after a takedown.** `TakeDownButton` called the
action and toasted, but never re-rendered, so the deleted ad stayed on screen
until a manual reload — which reads as a takedown that silently did nothing,
on every row of a queue a moderator is working through. Fixed with
`router.refresh()` on success only; `TakeDownButton` had no test file at all
and has one now.

**Redis resolves from this machine**, contradicting four separate claims in
`HANDOFF.md`. That unblocked the bucket test above, the Lua script, and uploads
generally — `upload-guard.ts` fails closed, which is likely why the owner's ad
had no photos at all. All four stale claims are corrected.

## The moderation queue is live in production

`/moderation` on `mampokoj.vercel.app` **refused every signed-in moderator for
days**, because `MODERATORS` was never set in the Vercel dashboard. The local
`HANDOFF.md` claimed otherwise and was wrong — see below. Fixed on 2026-10-03 by
adding the variable in Vercel; **no redeploy was needed**, and the queue now
renders 5 reported ads with phones and Take down buttons, verified signed in.

The cause was never the identity or the code. `moderator-guard.ts` fails closed
by design, so an unset allowlist produces no error, no log line, and a page that
simply says "Not allowed." — a symptom that names nothing about the cause.

**What was wrong in the docs, and why it is not repeated:**

- `HANDOFF.md` §1, §3 and §9.3 all asserted `.env` travels to the Vercel host.
  It does not: `.env` is gitignored, so it cannot travel with a push. That claim
  was self-contradictory and is what sent the debugging in the wrong direction.
- Env vars are set **in the Vercel dashboard, per environment**. Production-only
  leaves Preview deployments refusing identically.
- `SEED_ALLOW` is the opposite case and was also mis-documented: assume it *is*
  set in production, since `db:seed` then writes to production. `seed-guard.ts`'s
  header now says so.

**Added `pnpm env:check`** (`src/utils/env-check.tsx`), which reports the
variables whose absence is *silent* and exits 1 if any is empty or whitespace.
It reads this process's environment, so it verifies your machine — **not**
Vercel, which no script in this repo can see. `MODERATORS=pavel@gmail.com`
passes it and still refuses, because an email is not an account id. Not wired
into CI, because CI has no `.env` and would fail for the wrong reason.

**The real production smoke test is a signed-in visit to `/moderation`.** A
heading with an empty queue means the allowlist matched; "Not allowed." means it
did not.

## If `/moderation` refuses anyway

Almost always `MODERATORS`. It takes **OAuth account ids**, not email addresses
— the same value as `/dashboard/<userId>`, which you can read off any ad you
own. The allowlist fails closed, so a wrong value produces no error anywhere:
the page simply refuses. See `HANDOFF.md` §1.

The real value is deliberately not written down here. This repo is public, and
that id is a stable personal identifier which also lives in production's `.env`;
recording it in a tracked file only spreads it further for no benefit, since the
fix is always "copy the id out of your own `/dashboard/<userId>` URL".

## Still open, and the maintainer's call — not started

- [ ] **§2.2 — the E2E decision.** (a) a Neon branch per CI run, (b) a
      `postgres` service container needing a driver swap behind an env check,
      (c) local-only Playwright run by hand. Priority order once chosen: browse →
      region filter → load more → ad detail → intercepting modal → 404 for a
      deleted ad. Anonymous flows only.

      **Partly de-risked.** A Playwright MCP server is configured, so a browser
      can be driven against a running dev server without writing test files —
      which is how everything above was verified. It is *not* option (c): there
      is no committed suite and nothing in CI. MCP gave manual verification, not
      coverage.
- [ ] **§9.2 — retiring `withUserLock`, now genuinely unblocked.** Would delete
      `user-lock.ts`, `user-lock.test.ts`, `redis-client-contract.test.ts` and
      close §2.1 with it. **Its stated reason for being left alone is gone:**
      the Lua release script has now been executed against live Redis and is
      correct, so the open verification item that held this back no longer
      exists. §9.4's remaining gap (acquire-loop contention) is the only thing
      still unexercised, and retiring the lock would delete the question rather
      than answer it. Your call, but it is a real decision again rather than a
      deferred one.
- [ ] **Migrate `DeleteAdButton` onto `ConfirmDialog`.** Not needed, so not done
      while it was the risky path. It is the last duplicated dialog in the app.
- [ ] **`withUserLock` acquire-loop contention, if the lock stays.** Two
      concurrent callers, one winner, bounded by wall-clock. Needs live Redis
      and two simultaneous requests; half a day.

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
tests. **The verification work consumed two of them**, plus two more ads created
and deleted for the bucket test:

| Ad | How it went |
|---|---|
| `044ef7a4` | deleted by moderator takedown (queue 6 → 5) |
| `227f7b25` | deleted by owner path |
| `c7aa714b` | created + uploaded a real PNG for the bucket test, then deleted |

**Five reported rows remain, the owner holds 0 of their 2 ad slots, and total ads
went 201 → 200.** The bucket is back to **0 files** and all 393 remaining image
rows are synthetic `seeded-*` keys, so `storage:reconcile` reports no drift —
the database and the bucket agree.

To restore, re-report an ad from its detail page. **Never an unscoped delete**
(`HANDOFF.md` §5).
