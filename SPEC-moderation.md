# Spec: Ad reporting and moderation triage

Implements HANDOFF.md §9.3 ("no moderation, no reporting, no admin"), plus the
takedown path §9.3 implies but does not name.

**This spec resolves neither §9.2** (the ad lock) **nor §2.1** (E2E), by design:
§9.3 touches neither the ad lock, the slot index, nor the route topology E2E would
cover, so it was implementable without either decision. Both have since been taken
separately, and neither touched anything in this spec.

---

## 1. Objective

Anyone can post any phone number. When a scam ad goes up there is no flag to
click and no query to answer "what do we take down" — the remedy is a
hand-written `DELETE`.

The user story, twice over:

- **A visitor** who recognises a scam listing wants one click that marks it, and
  wants that click to mean something happens.
- **The operator** wants a queue of marked listings, and one action that removes
  one — without writing SQL.

Success looks like: a signed-in visitor reports an ad from its detail page; the
ad lands in a moderator-only queue; the operator takes it down; the ad is gone
from the site and its photos are gone from the bucket.

### Why this is not just a column

HANDOFF §9.3 proposes "a `reportedAt` column, a report button on the public
card, and one query". That is not sufficient, and shipping it would leave §9.3
open:

`deleteAdById` resolves ownership through `findAdOwnedByCurrentUser`, which
returns `null` for a non-owner. So whoever answers the triage queue **cannot
take an ad down through the app** — the remedy stays a hand-written `DELETE`,
which is the exact failure §9.3 opens with. A flag with no takedown moves the
work; it does not remove it.

This spec therefore adds a fourth piece: a moderator takedown that bypasses
ownership, behind its own authorization check.

### Decisions taken (confirmed with the maintainer)

| Question | Decision |
|---|---|
| Who may report? | Signed-in users only |
| One report or many? | `reportedAt` column, first report wins |
| Include a takedown? | Yes — moderator takedown behind an env allowlist |
| Where is the button? | Detail card only (`AdCardCompact`) |

### Assumptions I am making

1. **`reportedAt` is never public.** It is added to `PublicAd`'s `Omit` and not
   to `toPublicAd`'s body. Rationale: it is an abuse signal, and `reportedAt IS
   NOT NULL` on a listing is a fact about moderation state, not about the room.
   It is also a griefing oracle if the queue ever hides ads from the grid —
   anyone could binary-search ids to learn which listings are flagged.
2. **Reported ads stay visible.** Flagging does not hide, blur, or deprioritise
   an ad. Removal is a separate, human, accountable step. Auto-hiding on report
   would hand any signed-in account a one-click denial-of-service against any ad
   id, which is strictly worse than the thing being fixed.
3. **No rate limit on `reportAd`.** HANDOFF §9.2's reasoning applies directly: the
   "at most one report per ad" cap already bounds the abuse, so a rate limit
   would throttle nothing a spammer cares about, while reintroducing Redis into a
   write path that does not need it (and reopening the fail-open/fail-closed
   question §3 treats as deliberate).
4. **A poster cannot report their own ad.** One extra predicate; it keeps the
   queue free of self-inflicted noise and forecloses a poster gaming assumption 2.
5. **`MODERATORS` fails closed.** Unset or empty means nobody is a moderator.
6. **No admin UI** (HANDOFF §9.5 keeps excluding it). The moderation surface is
   one list and one button, not user management or content editing.

→ Correct me now, or I proceed.

---

## 2. Commands

```
Generate the migration:   pnpm db:generate      # CI fails if this produces a diff
Apply to a scratch DB:    pnpm db:migrate
Typecheck:                pnpm typecheck
Tests:                    pnpm test
Full gate:                pnpm verify            # lint && typecheck && test && build
Manual check:             pnpm dev
```

New script: none. The moderation queue is a route, not a CLI tool — see §5.

---

## 3. Project Structure

No new top-level directories. Everything lands beside what it changes.

```
src/
├── constants.tsx                        # REPORT_* constants if needed
├── lib/
│   ├── moderator-guard.ts               # NEW  pure: parse MODERATORS, isModerator
│   └── __tests__/moderator-guard.test.ts  # NEW
├── server/
│   ├── db/schema.ts                     # EDIT  reportedAt column + partial index
│   ├── ad-teardown.ts                   # NEW  shared file+row teardown (extracted)
│   ├── queries/select.tsx               # EDIT  getReportedAds
│   └── actions/
│       ├── reportAd.tsx                 # NEW
│       ├── deleteAdAsModerator.tsx      # NEW
│       ├── deleteAd.tsx                 # EDIT  use ad-teardown, ownership unchanged
│       └── __tests__/                   # NEW test files
├── components/
│   ├── ReportButton/                    # NEW  'use client'
│   ├── AdCard/AdCardCompact.tsx         # EDIT  render ReportButton when signed in
│   └── moderation/                      # NEW  queue table + take-down button
├── types/db-types.tsx                   # EDIT  add 'reportedAt' to PublicAd's Omit
├── lib/ad-dto.ts                        # UNCHANGED, deliberately
└── app/moderation/page.tsx              # NEW  gated queue
drizzle/                                 # EDIT  generated by pnpm db:generate
```

Tests live in `__tests__` folders beside the code (HANDOFF §5). Server-side test
files start with `// @vitest-environment node`.

---

## 4. Code Style

### 4.1 The schema change

`src/server/db/schema.ts`, in `ads`:

```ts
    /**
     * When a signed-in visitor flagged this listing, or null if nobody has.
     *
     * First report wins: the report is written with `reportedAt IS NULL` in its
     * own predicate, so a second report updates no rows. Deliberately private --
     * it is moderation state, not a property of the room, and it is omitted from
     * `PublicAd`.
     */
    reportedAt: d.timestamp({ withTimezone: true }),
```

and in the table's third argument:

```ts
    /**
     * Partial: the moderation queue is `WHERE "reportedAt" IS NOT NULL`, and on a
     * table where almost every row is null a partial index is a fraction of the
     * size. It also keeps `migrations.test.ts`'s per-migration `CREATE` assertion
     * satisfied for the right reason rather than by a placeholder.
     */
    index('mampokoj_ads_reported_idx')
      .on(t.reportedAt)
      .where(sql`${t.reportedAt} IS NOT NULL`),
```

Nullable with no default, matching the two timestamp idioms already in this
file: `createdAt` uses `$defaultFn`, `reportedAt` needs neither default nor
`$onUpdate` because the report action is the only writer and sets it explicitly.

### 4.2 The report write — one atomic statement

This is the slot-index trick from HANDOFF §7, applied to a flag. No transaction,
no Redis, no read-then-write:

```ts
// src/server/actions/reportAd.tsx
export type ReportAdResult =
  | { success: true }
  | { success: false; error: string };

const reported = await db
  .update(ads)
  .set({ reportedAt: new Date() })
  .where(
    and(
      eq(ads.id, parsed.data),
      isNull(ads.reportedAt),      // first report wins
      ne(ads.userId, userId)       // a poster cannot flag their own ad
    )
  )
  .returning({ id: ads.id });

if (reported.length === 0) {
  // One message for all three refusals -- already reported, own ad, no such ad.
  return { success: false, error: 'Could not report this ad' };
}
```

HANDOFF §4 records that a unique violation arrives on `error.cause`, and §7
records that `db.transaction` throws on the neon-http driver. A single
conditional `UPDATE ... RETURNING` needs neither, and two concurrent reports
resolve without either of them failing.

**Why one undifferentiated message.** `src/lib/ads.ts` refuses to distinguish
"no such ad" from "not yours" so a caller cannot enumerate ids. That doctrine is
*not* cargo-culted here, and the spec says why: ad existence is already
observable — `getValidatedAd` returns null and the detail route calls
`notFound()`, so any visitor can tell 200 from 404 on `/ad/<id>`. There is no
existence secret left to protect. What the single message still buys is
simplicity: "already reported" would be a lie for a self-report, so one honest
neutral string is both simpler and more truthful.

### 4.3 The moderator check — pure, so it is testable

`src/lib/moderator-guard.ts` mirrors `src/utils/seed-guard.ts`, which is
deliberately free of `server-only` and of any database import so the rule can be
tested without a connection:

```ts
/**
 * Who may moderate.
 *
 * `MODERATORS` is a comma-separated list of OAuth account ids -- the same ids
 * `ads.userId` holds, so GitHub and Google ids are both valid entries. An unset
 * or empty value means nobody moderates: this fails closed, because the failure
 * mode of an unset allowlist on a live site is an open takedown button.
 *
 * Deliberately not `use server`: `src/lib/session.ts` documents that marking a
 * module `'use server'` publishes its exports as remotely callable endpoints,
 * and this one reads an environment variable.
 */
export function parseModeratorAllowlist(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

export function isModerator(
  userId: string | null,
  allowlist: ReadonlySet<string>
): boolean {
  if (!userId) return false;
  return allowlist.has(userId);
}
```

Two details that are load-bearing and will be tested: the empty-string entry is
filtered out, so a `MODERATORS=,` value cannot match an empty `userId`; and
`isModerator` checks `!userId` before the set lookup, so a signed-out visitor
cannot be matched by a malformed allowlist.

### 4.4 Shared teardown, so the two delete paths cannot drift

`deleteAdById` (owner removes own ad) and `deleteAdAsModerator` (operator removes
any ad) must delete the same things in the same order: UploadThing files, then
image rows, then the ad row. Duplicating that sequence across two files is how
the next change orphans a file in a bucket that bills for it (HANDOFF §2.2).

`src/server/ad-teardown.ts`:

```ts
/**
 * Removes an ad and everything that belongs to it, in the order the storage
 * layer requires.
 *
 * Files first, then the rows that name them. `images.adId` cascades on delete,
 * so the row deletes could be collapsed into one -- but the `fileKey`s have to
 * be read before any row goes, and doing that first is what makes the read
 * possible.
 *
 * Shared by the owner path and the moderator path so the two cannot drift. The
 * caller has already decided *whether* the ad may be removed; nothing here
 * re-checks authorization.
 */
export async function teardownAd(adId: string): Promise<void> {
  const imagesToDelete = await db.query.images.findMany({
    where: eq(images.adId, adId),
    columns: { fileKey: true },
  });

  if (imagesToDelete.length) {
    await utapi.deleteFiles(imagesToDelete.map((i) => i.fileKey));
  }

  await db.delete(images).where(eq(images.adId, adId));
  await db.delete(ads).where(eq(ads.id, adId));
}
```

`deleteAdById` keeps its ownership check byte-for-byte and swaps its body for a
call to this. **Its authorization is not refactored, relaxed, or made
configurable** — the moderator bypass is a separate action, so a reader auditing
"can someone delete an ad they do not own?" finds the answer in one file.

### 4.5 The moderation gate, before the query

`src/app/moderation/page.tsx` follows the precedent in
`src/app/dashboard/[userId]/page.tsx:26-30`, which checks
`canViewDashboard` *before* the query rather than filtering results after:

```tsx
  // Checked before the query, for the same reason the dashboard does it: this
  // is a route whose data is selected by a page rather than by the session, and
  // the allowlist is the only thing standing between an anonymous visitor and
  // every reported ad's phone number.
  if (!isModerator(serverUserId, parseModeratorAllowlist(process.env.MODERATORS))) {
    return <h3>Not allowed.</h3>;
  }
```

`<h3>Not allowed.</h3>` rather than `notFound()` or a redirect, because that is
the established convention for the app's only existing authorization failure and
an inconsistent second convention would be its own defect.

### 4.6 The button

`src/components/ReportButton/ReportButton.tsx` is `'use client'` and follows
`DeleteAdButton` (toast + `isPending` + no navigation) and `BlurredPhone` (a
client child extracted so an async Server Component can render it).

Rendered from `AdCardCompact` only when signed in, since `AdCardCompact` already
holds `currentUser`:

```tsx
{currentUser && <ReportButton adId={ad.id} />}
```

Two placement facts that are decisions, not accidents:

- `AdCardCompact` renders in **both** the detail page and the intercepting modal
  at `@modal/(.)ad/[adId]`. The button therefore appears in both, for the same ad.
  That is consistent, not a duplication bug.
- It goes inside `InfoWrapper`, so it inherits the `[data-modal-box]` styling
  branch that `AdCardCompact.styles.tsx` already scopes.
- It is **not** on `AdSummaryCard`. That component is `'use client'` and sits
  inside a full-card `<Link>`, so a button there is a nested interactive element
  rendered ten times per page.

---

## 5. Testing Strategy

Framework: Vitest (`pnpm test`), 277 existing tests must stay green. The
governing doctrine is HANDOFF §5, and three of its rules bind this feature
directly:

- **Revert the fix and confirm the test fails before believing it proves
  anything.** Applied to every authorization assertion below.
- **Assert authorization against compiled SQL** via `src/test/drizzle-where.ts`
  (`compileWhere`, `constrainsColumn`). A mock that returns "no row" passes even
  when the check is deleted.
- **Say what a test catches, not what it hopes it catches.** Every test below
  carries that as a doc comment.

### 5.1 `src/lib/__tests__/moderator-guard.test.ts` (pure, jsdom)

- `MODERATORS` unset, empty, whitespace-only, and `"a, ,b,"` all parse to the
  expected set. Catches: a trailing comma in `.env` silently granting moderator
  to nobody, or an empty entry matching an empty `userId`.
- `isModerator(null, ...)` is false **even when the allowlist contains `''`**.
  Catches: a signed-out visitor passing the gate on a malformed allowlist.
- Fails closed: unset allowlist makes no `userId` a moderator.

### 5.2 `src/server/actions/__tests__/reportAd.test.ts` (node)

Mock `db`, `requireUserId`. Assert on `compileWhere` of the clause that reached
the driver.

- The update's predicate **constrains `"reportedAt"` with `is null`** — first
  report wins. *Revert check:* drop `isNull` and this must fail.
- The predicate **constrains `"userId"`** — a poster cannot flag their own ad.
  *Revert check:* drop `ne(ads.userId, userId)` and this must fail. This is the
  HANDOFF §5 rule applied literally.
- Signed out: returns `Unauthorized` **and issues no update at all**. A version
  that updates then checks would pass a `success: false` assertion; asserting the
  absence of the write is what catches it.
- Zero rows returned: `success: false`, no throw. Covers already-reported, own ad
  and nonexistent alike.
- A thrown driver error returns a generic message and calls `console.error`;
  the test asserts the raw driver message is **not** in the returned error
  (constraint and table names leak, per `deleteAd.tsx`'s comment).
- `reportedAt` is written as a value, not left to `$defaultFn` — the report
  action is the only writer.

### 5.3 `src/server/actions/__tests__/deleteAdAsModerator.test.ts` (node)

Mock `db`, `utapi`, `requireUserId`, and the env.

- **Non-moderator: the allowlist is the only gate, and it is load-bearing.**
  Assert `utapi.deleteFiles` and both `db.delete` calls were **not** invoked.
  *Revert check:* delete the `isModerator` call and this must fail. This is the
  test that makes the takedown safe to add.
- Non-moderator returns the generic refusal and never surfaces whether the ad
  exists.
- Moderator: teardown runs in order — files, then image rows, then the ad row.
  Asserts the *sequence* via call order, because deleting rows before reading
  `fileKey`s orphans real paid storage.
- The lookup for the ad is **not** ownership-constrained: `constrainsColumn` must
  be false for `"userId"`, which is what distinguishes this from `deleteAdById`
  at the SQL level rather than by name.
- Teardown throws → generic error, `console.error` called.
- `deleteAdById` still rejects a non-owner: covered in its existing test file,
  which must stay green and unmodified in intent.

### 5.4 `src/server/__tests__/select.reported.test.ts` (node)

- `getReportedAds` constrains `"reportedAt"` with `is not null`. *Revert check:*
  drop the predicate and the test must fail — otherwise it returns all 201 seeded
  ads.
- Orders by `reportedAt` descending — the newest report is the one to answer.
- Columns **include** `userId`, `contactPhone` and `reportedAt`, and **exclude**
  nothing a moderator needs. Catches: reusing `publicAdColumns` here, which would
  quietly drop the phone number — the exact field a scam report is about.
- The read is **bounded**, mirroring `getUserAds`'s on-principle limit.

### 5.5 `src/lib/__tests__/ad-dto.test.ts` (additions)

- `reportedAt` is **absent** from `Object.keys(toPublicAd(FULL_ROW))`, with a
  message saying it catches publishing moderation state as public data.
  The existing exact-key-set assertion at line 111 covers this implicitly; this
  makes it explicit and named.

### 5.6 `src/utils/__tests__/migrations.test.ts` (additions)

The existing generic assertions engage the new column automatically. Added:

- The generated migration contains `ADD COLUMN "reportedAt"`.
- It creates `mampokoj_ads_reported_idx` **with `WHERE "reportedAt" IS NOT
  NULL`**. A plain index would satisfy the `CREATE` assertion while being the
  wrong shape, so the partial predicate is asserted explicitly.

### 5.7 `src/components/ReportButton/__tests__/ReportButton.test.tsx` (jsdom)

`vi.mock` the action and `useToast`, following `DeleteAdButton`'s shape.

- Renders a real `<button>` with an accessible name (role+name query, per
  `AdCardCompact.contact.test.tsx`).
- Clicking calls the action with the ad id exactly once.
- Disabled while pending, so a double click cannot file two reports.
- Success and failure each surface a toast.

### 5.8 Moderation page gate

`AdCardCompact` establishes the convention for testing an async Server
Component: test the extracted client child, pin the server-side branch with a
source-read test (cf. `AdCardCompact.placement.test.ts`).

- `isModerator(sessionUserId, allowlist)` is tested directly in 5.1.
- A source-read test asserts the gate appears **before** `getReportedAds` in
  `app/moderation/page.tsx`. *Revert check:* move the query above the check and
  the test must fail — that ordering is the entire protection.

### 5.9 Manual verification

Per HANDOFF §1, Postgres is reachable and `CREATE DATABASE` is permitted, so the
migration is **verified, not assumed**: create a scratch database, `db:migrate`
onto it, and confirm the column and partial index exist. Note the `-pooler` host
requires terminating idle sessions before the scratch database can be dropped.

Then, by hand in `pnpm dev`: sign in, open an ad, report it, confirm the toast;
sign in as a moderator, open `/moderation`, confirm the ad is listed; take it
down; confirm the ad 404s and its photos are gone from the bucket.

---

## 6. Boundaries

**Always**

- Revert the fix and confirm the test fails before trusting it (HANDOFF §5).
- Assert authorization against compiled SQL, not against mock return values.
- `console.error` server-side; never return a raw driver message to a client.
- One `'use client'` boundary per new interactive component; Server Components
  stay free of handlers.
- Commit the generated migration — CI runs `db:generate` and fails on a diff.

**Ask first**

- Any change to the `(userId, slot)` unique index or the ad limit (§7).
- Reintroducing an advisory lock on the create path. It was deleted (§9.2) and the
  slot index is what holds the limit.
- Any new table, or a non-partial index.
- Adding `reportedAt` to `PublicAd`, or any other change to `toPublicAd`.
- Touching `users`, `customers`, `invoices`, `revenue` or the `roomFinder`
  schema (§8 — residue, not ours to delete).
- Any `db.delete` in a script, unscoped (HANDOFF §5).

**Never**

- Publishing `reportedAt`, `userId` or `contactPhone` to the public ad payload.
- Letting the moderator check fall open on a missing or empty `MODERATORS`.
- Refactoring `deleteAdById`'s ownership check to share a code path with the
  moderator bypass.
- Introducing a role column, a permissions table, or a second auth provider to
  express "moderator".
- Auto-hiding, blurring or deprioritising an ad because it was reported.

---

## 7. Success Criteria

Specific and testable. All must hold for the feature to be done.

1. `pnpm verify` is green: lint 0 warnings, `tsc` clean, all pre-existing tests
   plus the new ones pass, `next build` succeeds.
2. `drizzle/` contains a generated migration adding `"reportedAt"` and the
   partial index; CI's `db:generate` diff check passes.
3. The migration has been **applied to a real scratch database** and the column
   and index confirmed present — not merely generated.
4. A signed-in visitor can report an ad from its detail page and in the
   intercepting modal. An anonymous visitor sees no button and the action
   returns `Unauthorized` without writing.
5. A second report of the same ad changes nothing, verified against a real
   database by two concurrent reports in which exactly one row is written.
6. A poster's report of their own ad is refused, asserted against compiled SQL.
7. `reportedAt` does not appear in `PublicAd`, in the public API response, or in
   the rendered grid — asserted, not assumed.
8. A non-moderator cannot reach `/moderation` and cannot invoke the takedown
   action, asserted by *reverting the allowlist check and confirming the tests
   fail*.
9. A moderator can list reported ads, ordered newest-first, and take one down;
   its images are removed from UploadThing and its rows from Postgres.
10. A report bumps `updatedAt`. See §8.

## 8. Resolved Questions

**8.1 `updatedAt` moves when an ad is reported — accepted, documented, pinned.**
Drizzle's `$onUpdate` fires on any `db.update()`, and the report must stay a
single atomic statement to get first-report-wins for free. Avoiding the bump
needs raw SQL, which forfeits `compileWhere` — the repo's first-class tool for
asserting authorization (§5). Confirmed with the maintainer: keep the drizzle
builder and the assertable predicate, and pin the side effect in a test so it is
a decision on record rather than an accident. Nothing currently orders by
`updatedAt`, so the practical impact is a detail page showing a fresher "updated"
date than the poster earned. **§5.2 asserts this so it cannot be rediscovered as
a bug.**

**8.2 The queue page is triage, not an admin UI — kept.**
HANDOFF §9.5 excludes an admin UI, and the maintainer confirmed a `/moderation`
list-and-one-button counts as triage. Recorded here because it is a reading of an
explicit exclusion, not something the handoff said outright. The fallback was a
documented `SELECT` with a gated action and no page; that was declined because it
loses the queue and leaves the moderator writing SQL to find what's reported.

**8.3 `MODERATORS` is set in production, and is not a secret.**
`.env` travels to the Vercel host (§3), so the allowlist is readable in the
deployed environment. Intended: it gates the *web* surface, and anyone who can
run a script with the repo's `.env` is already fully privileged. The ids are
OAuth account ids, not credentials.

## 9. Remaining Open Questions

1. **No re-report and no un-report.** Once flagged, an ad stays flagged until it
   is deleted. If the queue ever needs dismissing without deletion, that is a
   `dismissedAt` column and is deliberately not in this spec.
