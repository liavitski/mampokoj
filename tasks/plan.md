# Implementation Plan: Ad reporting and moderation triage

Implements `SPEC-moderation.md`, which closes HANDOFF.md §9.3 and adds the
takedown path §9.3 implies but does not name.

**Out of scope, deliberately:** §9.2 (`withUserLock` retirement) and §2.2 (the E2E
decision) are untouched. §9.3 touches neither the ad lock, the slot index, nor the
route topology E2E would cover, so it lands without either decision.

**Baseline:** `pnpm verify` green — lint 0 warnings, `tsc` clean, 277 tests across
33 files, `next build` succeeds. Confirmed, not assumed.

---

## Overview

A signed-in visitor can flag a listing from its detail page. A moderator — named
in a `MODERATORS` env allowlist — can list what has been flagged and take it down,
including its photos. Four pieces: a nullable `reportedAt` on `ads`, one atomic
report write, a moderator-only queue, and a takedown action that bypasses
ownership behind its own check.

## Architecture Decisions

1. **First report wins, enforced in the write's own predicate.**
   `UPDATE ... WHERE id = ? AND "reportedAt" IS NULL AND "userId" <> ? RETURNING id`.
   No transaction, no Redis, no read-then-write. This is the slot-index trick from
   §7 applied to a flag, so it needs none of the mechanisms §3 records as
   unavailable on neon-http (`db.transaction` throws; a trigger runs inside the
   INSERT's snapshot).

2. **The moderator bypass is a separate action, never a parameter.**
   `deleteAdById` keeps its ownership check byte-for-byte. Making the bypass a
   flag on the existing action would mean the answer to "can someone delete an ad
   they do not own?" is spread across two files.
k
3. **Teardown is extracted so the two delete paths cannot drift.**
   Files → image rows → ad row, in that order, because the `fileKey`s must be
   read before any row goes. Duplicating that sequence is how a paid file gets
   orphaned in the bucket (§2.3).

4. **`reportedAt` is private.** Omitted from `PublicAd`, absent from
   `toPublicAd`. It is moderation state, and a public flag is an oracle for
   probing which ad ids are flagged.

5. **The moderator allowlist fails closed and is pure.**
   `src/lib/moderator-guard.ts` has no `server-only` and no database import, so
   the rule is testable without a connection — mirroring `src/utils/seed-guard.ts`.

6. **No rate limit on `reportAd`.** §9.2's reasoning: "at most one report per ad"
   already bounds the abuse, so a limiter would throttle nothing a spammer cares
   about, while putting Redis back in a write path that does not need it.

7. **Reported ads stay visible.** Auto-hiding would hand any signed-in account a
   one-click denial of service against any ad id.

## Task List

Sliced vertically, in two shippable phases. Phase 1 is the shared data
foundation both slices depend on; Phases 2 and 3 are each independently useful.

### Phase 1: Data foundation

- [ ] **Task 1: Add `reportedAt` and its partial index**
- [ ] **Task 2: Verify the migration against a real scratch database**

### Checkpoint: Foundation
- [ ] `pnpm verify` green
- [ ] Migration applied to a scratch DB, column and partial index confirmed present
- [ ] Shared dev/prod database untouched

### Phase 2: Slice A — a signed-in visitor can report an ad

- [ ] **Task 3: `reportAd` server action**
- [ ] **Task 4: `ReportButton` client component**
- [ ] **Task 5: Wire the button into `AdCardCompact`**

### Checkpoint: Slice A
- [ ] `pnpm verify` green
- [ ] Every `reportAd` authorization test fails when its predicate is removed
- [ ] Manual: sign in, report an ad, see the toast; sign out, see no button

### Phase 3: Slice B — a moderator can triage and take down

- [ ] **Task 6: `moderator-guard`**
- [ ] **Task 7: Extract `ad-teardown`, refactor `deleteAd`**
- [ ] **Task 8: `deleteAdAsModerator`**
- [ ] **Task 9: `getReportedAds`**
- [ ] **Task 10: `/moderation` page**

### Checkpoint: Slice B
- [ ] `pnpm verify` green
- [ ] The takedown test fails when the allowlist check is removed
- [ ] Manual: moderator lists a reported ad, takes it down, it 404s and its photos leave the bucket

### Phase 4: Close out

- [ ] **Task 11: Update `HANDOFF.md`**

### Checkpoint: Complete
- [ ] All 10 success criteria in `SPEC-moderation.md` §7 hold
- [ ] `pnpm verify` green, no pre-existing test weakened or deleted
- [ ] Ready for review

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `db:migrate` touches the shared dev/**prod** database (§3) | High — adds a column to production holding real data | Verify on a **scratch** database only (§1 confirms `CREATE DATABASE` is permitted). A nullable `ADD COLUMN` changes no rows, but the migration is still not run against the shared DB as part of this work. |
| Scratch DB cannot be dropped afterwards | Low | §1: the `-pooler` host keeps sessions alive; terminate them first with the `pg_terminate_backend` query in §1. |
| Drizzle `.where()` on an index unsupported | Medium | **Already resolved** — `pg-core/indexes.d.ts:67` declares `where(condition: SQL)` on drizzle-orm 0.45.2. Task 1 verifies it by generating, not by reading types alone. |
| `.returning()` unsupported over neon-http | Medium | Task 1 proves it in the scratch database before Task 3 depends on it. If unsupported, the fallback is a read-back existence check, which costs the atomicity guarantee and would reopen the design. |
| A test passes because it tests the mock | High | HANDOFF §5 governs. Every authorization assertion is against compiled SQL via `src/test/drizzle-where.ts`, and each is verified by **removing the predicate and confirming the test fails** before being believed. |
| Moderator bypass becomes a general delete hole | High | The bypass lives in exactly one action, `deleteAdAsModerator`, gated by a pure allowlist. Task 8's central test asserts *no* storage write occurs for a non-moderator, and fails when the allowlist check is deleted. |
| `PublicAd` accidentally gains `reportedAt` | Medium | Task 5 adds an explicit assertion that it is absent, naming what it catches. The existing exact-key-set test at `ad-dto.test.ts:111` already fails closed on the `Omit` side. |
| Reported ads get hidden from the grid | Medium | An explicit non-goal in the spec's "Never" list. Nothing in this plan touches `getAds`. |

## Parallelization Opportunities

**Must be sequential:** Task 1 → everything (the column is the shared foundation).
Task 7 → Task 8 (the takedown consumes the extracted teardown).

**Safe to parallelize once Phase 1 lands:** Tasks 4 (`ReportButton`) and 6
(`moderator-guard`) are independent leaves — a client component and a pure
function, touching no shared file. Task 9 (`getReportedAds`) depends only on
Task 1.

**Not parallelizable:** Task 5 touches `AdCardCompact` and the DTO types, which
Task 4's wiring depends on. Task 10 depends on 6, 8 and 9.

## Open Questions

- (None blocking. `SPEC-moderation.md` §9.1 records the one non-blocking item: no
  re-report and no un-report, so a flagged ad stays flagged until deleted.)
