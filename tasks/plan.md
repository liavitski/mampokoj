# Plan: Ad reporting and moderation triage — COMPLETE

Spec: `SPEC-moderation.md`. Status: **shipped** and verified in a real browser.
Baseline: `pnpm verify` green — lint 0 warnings, `tsc` clean, **419 tests across
48 files**, `next build` succeeds.

This file was the forward-looking plan; it is now the record of what was built
and what deviated. `HANDOFF.md` is the durable source of truth for the project;
this is the work log for this feature.

---

## What shipped

| Commit | Piece |
|---|---|
| `4beb424` | `reportedAt` column + partial index, withheld from every public payload |
| `ac75ad3` | `reportAd` action, `ReportButton`, wiring into `AdCardCompact` |
| `6b261b5` | `moderator-guard`, `ad-teardown`, `deleteAdAsModerator`, `getReportedAds`, `/moderation` |
| `3dd9358` | One sign-in provider (GitHub dropped) |
| `dbd093e` | `HANDOFF.md` — §9.3 closed, new traps recorded |

Nothing from the original 11-task plan was cut. The order held: schema first,
because both slices depend on the column.

## Architecture decisions, as built

1. **First report wins, enforced in the write's predicate.** One
   `UPDATE ... WHERE id = ? AND "reportedAt" IS NULL AND "userId" <> ? RETURNING id`.
   No transaction (`db.transaction` throws on neon-http, §3), no Redis — putting
   Redis in a write path would have made an outage mean "reports silently fail".
   The slot index's reasoning (§7).
2. **The bypass lives in one action.** `deleteAdAsModerator`, never a flag on
   `deleteAdById`, whose ownership check is unchanged and unshared.
3. **Teardown extracted** so the owner and moderator paths cannot drift.
4. **`reportedAt` private**, excluded at the query rather than the type.
5. **Allowlist fails closed**; `MODERATORS` is account ids, not emails.
6. **No rate limit on `reportAd`** (§9.2's reasoning).
7. **Reported ads stay visible** — hiding them is a one-click DoS.

## Deviations from the plan, and why

Recorded because the plan is now history and these are the parts a reader would
otherwise assume were planned.

- **`detailAdColumns` added in Task 1, unplanned.** Omitting `reportedAt` from
  `PublicAd` was not enough: `getValidatedAd` selects the whole row, so the
  column still crossed the wire inside the RSC payload for `/ad/[adId]`. Caught
  while implementing; the type omission had said "safe" while the payload said
  otherwise.
- **`ConfirmDialog` extracted (Task 10).** `TakeDownButton` and
  `DeleteAdButton` both need a confirmation. Copying the dialog a second time
  would duplicate overlay/title/description/action styles — the drift that
  produced the nested-card regression in `AdCardCompact.styles`. `DeleteAdButton`
  was **not** refactored onto it at the time, and did drift: it grew its own copy
  of the overlay, title, description and keyframes. Migrated later, with a
  source-read test to stop a third.
- **`getReportedAds` narrows `reportedAt` with a type predicate**, not an
  assertion, because the column is nullable in the schema and the `isNotNull`
  predicate is invisible to TypeScript.
- **`ReportButton` gained a disabled "Reported" state** after success. Not in
  the spec. `reportedAt` is withheld from every public payload, so the server
  cannot tell the component the ad is flagged — this is session-local truth and
  resets on reload.
- **GitHub removal was not in the plan at all.** Added after the maintainer
  supplied the moderator's email, which made the account-id distinction
  concrete. It also dissolved the two-identities problem (§7) and removed the
  need for a "signed in but not a moderator" diagnostic.

## One incident worth keeping

Phase 1 verified migration `0002` on a scratch database and deliberately did not
apply it to the shared one. That broke development immediately:
`getUserAds` selects the whole row, so a column the schema declared and the
database lacked made the dashboard throw, and every report failed behind a
generic toast. Fixed with `pnpm db:migrate`.

Recorded in `HANDOFF.md` §4 as a trap. The lesson is narrow and does not
generalise away: **`getUserAds` is the canary precisely because it selects the
whole row**, so narrowing it to an explicit column list would convert a loud
failure into a silently `undefined` field. Verifying a migration is not the same
as the database having it.

## Data state after verification

The six reported rows in the shared database were the maintainer's own manual
tests, and verification consumed two of them plus two ads created and deleted for
the bucket test. Five reported rows remain, the owner holds 0 of their 2 ad slots,
and the bucket is back to 0 files. To restore, re-report an ad from its detail
page. **Never an unscoped delete** (`HANDOFF.md` §5).

## Verification, and what it turned up

All five browser checks ran on 2026-10-03 and passed, driving Chrome with a real
Google sign-in: `MODERATORS` loaded, `/moderation` listed six rows newest-first in
the order `getReportedAds` returns, a takedown and an owner delete each removed
their row and image rows, and the dashboard still reported the limit as 2.

Two things came out of it, both fixed:

- **The queue did not refresh after a takedown.** `TakeDownButton` called the
  action and toasted, but never re-rendered, so the deleted ad stayed on screen
  until a manual reload — which reads as a takedown that silently did nothing.
  Fixed with `router.refresh()` on success only.
- **The bucket path was unverifiable with the current data**, so the first
  `utapi.deleteFiles` check passed against an empty bucket and proved nothing.
  It was repeated against a real uploaded file, and the generalisable rule — measure
  the precondition before recording a check — is in `HANDOFF.md` §5.

## Deliberately not done

- The signed-in "you are not a moderator" diagnostic. Unnecessary now that
  there is one provider; `MODERATORS`-is-ids-not-emails is documented in
  `HANDOFF.md` §1 instead.
- An un-report or a re-report. A flagged ad stays flagged until deleted.
  `SPEC-moderation.md` §9.1 records this as the one open item in the spec.

## Since this feature shipped

Two things outside it have since been closed, recorded here because this is where
the reasoning lives: E2E was taken local-only and off the critical path
(`HANDOFF.md` §2.1), and `withUserLock` was retired once the slot index was shown
to hold the limit on its own (§9.2). Neither touched anything in this feature.
Open work is in `tasks/todo.md`.
