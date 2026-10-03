# Tasks: Ad reporting and moderation triage

Plan: `tasks/plan.md` · Spec: `SPEC-moderation.md` · Handoff: `HANDOFF.md`

**Status: shipped and verified in a real browser.** `pnpm verify` green — 419
tests across 48 files, lint 0 warnings, `tsc` clean, build clean. A Playwright
E2E suite adds 24 specs (`pnpm test:e2e`), green 4 consecutive runs against a
production build. The finished phases are in `git log` and `tasks/plan.md`.

# OPEN: three items, none of them blocking

The moderation feature shipped and was verified in a real browser on 2026-10-03;
`git log` and `tasks/plan.md` have that history. What remains is below. None of it
blocks anything, and none of it needs a decision that has not already been taken.

- [ ] **`notFound()` answers HTTP 200, not 404, for a missing ad.** Found by the
      Playwright suite, confirmed with `curl` against a production build. The route
      is behind a Suspense boundary, so the head commits before the query runs and
      the status can no longer change. The visitor sees the right page; search
      engines and uptime monitors do not. `HANDOFF.md` §9.4.

- [ ] **Every seeded ad photo 404s.** `seed-data.ts` hardcodes 11 `ufs.sh` URLs
      into `images.url` and none of those files exist, so every seeded card shows a
      broken thumbnail. The same rows carry a synthetic `seeded-*` `fileKey`, which
      is why `storage:reconcile` reports **no drift** — two columns of one row
      disagree and only one of them is checked. Either point the seed at live files
      or accept the broken image; nothing enforces it either way.
      `HANDOFF.md` §2.2.

- [ ] **A cursor pager for `getAllAds`.** The moderation page's "all ads" list is
      bounded to `PAGE_SIZE` (10) with no pager, so of 194 seeded rows only 10 are
      reachable. Flagged, not requested.

## Open questions that need your decision

None. The two that were waiting — the E2E route and retiring `withUserLock` —
have both been taken, and `HANDOFF.md` records why in §2.1 and §9.2.
