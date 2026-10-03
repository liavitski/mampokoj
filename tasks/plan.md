# Plan: Ad reporting and moderation triage — COMPLETE

Spec: `SPEC-moderation.md`. Status: **shipped**, with four runtime checks that
need a browser (§ Remaining work). Baseline: `pnpm verify` green — lint 0
warnings, `tsc` clean, **361 tests across 42 files**, `next build` succeeds.

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
   No transaction (`db.transaction` throws on neon-http, §3), no Redis
   (unreachable, §1). The slot index's reasoning (§7).
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
  was **not** refactored onto it; that is a possible follow-up.
- **`getReportedAds` narrows `reportedAt` with a type predicate**, not an
  assertion, because the column is nullable in the schema and the `isNotNull`
  predicate is invisible to TypeScript.
- **`ReportButton` gained a disabled "Reported" state** after success. Not in
  the spec. `reportedAt` is withheld from every public payload, so the server
  cannot tell the component the ad is flagged — this is session-local truth and
  resets on reload.
- **GitHub removal was not in the plan at all.** Added after the maintainer
  supplied the moderator's email, which made the account-id distinction
  concrete. It also dissolved the two-identities problem (§9.5) and removed the
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

## Remaining work

**The five browser checks were run on 2026-10-03** and four passed; see
`tasks/todo.md` for the results and the two things they turned up.

1. ~~Restart `pnpm dev`.~~ The server had started at 11:26 against a `.env`
   written at 12:34, so `MODERATORS` really was missing from the process.
   Restarted and confirmed.
2. ~~`/moderation` lists the reported ads.~~ Rendered six rows for a moderator,
   newest first, each with a `tel:` link and a Take down button. The row order
   was checked against the database rather than trusted from the page.
3. **Take one down** — verified, with one exception. `044ef7a4` deleted, image
   row cascaded, queue 6 → 5, `/ad/044ef7a4` 404s. **But the photos could not
   be shown leaving the bucket**: the bucket holds 0 files and every image key
   is a synthetic `seeded-*` one that was never uploaded. `utapi.deleteFiles`
   ran live and returned cleanly, which is not proof — a wrong key is also
   silent.
4. **Delete an owned ad** — same result, same bucket caveat. `227f7b25` deleted
   via `deleteAdById`, so both callers of the extracted teardown now have run
   against a real session. That ad had no image rows at all.
5. ~~Dashboard shows the ad limit as 2.~~ Confirmed, with one ad held.

**Two new findings, both left unfixed** because these checks were meant to be
verification rather than development:

- **The queue does not refresh after a takedown.** `TakeDownButton` never calls
  `router.refresh()`, so the deleted ad stays rendered until a manual reload.
  Found because the page still showed 6 rows immediately after a successful
  delete — and that is exactly what a broken takedown looks like.
- **The bucket path is unverifiable with the current data.** Closing it needs
  one real photo uploaded to a real ad, then that ad deleted.

## Deliberately not done

- The signed-in "you are not a moderator" diagnostic. Unnecessary now that
  there is one provider; `MODERATORS`-is-ids-not-emails is documented in
  `HANDOFF.md` §1 instead.
- `DeleteAdButton` migrated onto `ConfirmDialog`.
- An un-report or a re-report. A flagged ad stays flagged until deleted.
  `SPEC-moderation.md` §9.1 records this as the one open item in the spec.

## Unresolved, and still the maintainer's call

- **§2.2 — the E2E decision.** Untouched by all of this. Every route is dynamic
  and reads Postgres, so E2E needs a database this repo does not provision.
- **§9.2 — retiring `withUserLock`.** Now that the slot index enforces the
  limit, the lock buys only serialization. Deleting it would take Redis out of
  the create path entirely and close §2.1 and §9.4 with it. Left in place
  because it deletes a deliberately engineered module whose Lua release script
  has an open verification item of its own.
