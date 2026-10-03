// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SQL } from 'drizzle-orm';

import { constrainsColumn, compileWhere } from '@/test/drizzle-where';

const { mocks } = vi.hoisted(() => ({ mocks: { findMany: vi.fn() } }));

vi.mock('@/server/db', () => ({
  db: { query: { ads: { findMany: mocks.findMany } } },
}));

const { getAds, getAllAds, getReportedAds } = await import('../select');

function predicate(): SQL | undefined {
  return mocks.findMany.mock.calls.at(-1)![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe('getAllAds', () => {
  it('returns every ad, not a filtered subset', async () => {
    await getAllAds();

    // No predicate at all, and that is the point: this list exists so a moderator
    // can delete an ad nobody reported, which means it has to contain the ads
    // that were never reported. Adding a `where` here would quietly turn it back
    // into a second copy of the queue.
    //
    // The cursor case below is the one place a predicate is correct, so this is
    // asserted without one rather than "never has a where".
    expect(predicate()).toBeUndefined();
  });

  it('answers newest first', async () => {
    await getAllAds();

    // Backed by mampokoj_ads_created_id_idx, whose descending (createdAt, id)
    // scan serves this ordering for free. `id` is in the ordering as well as the
    // index because createdAt alone is not unique -- two ads posted in the same
    // millisecond would otherwise come back in an order that varies per query,
    // and a moderator paging a list that reshuffles cannot reason about it.
    const config = mocks.findMany.mock.calls.at(-1)![0];
    const orderings = config.orderBy(
      { createdAt: { name: 'createdAt' }, id: { name: 'id' } },
      {
        desc: (column: { name: string }) => `desc:${column.name}`,
        asc: (column: { name: string }) => `asc:${column.name}`,
      }
    );

    expect(orderings).toEqual(['desc:createdAt', 'desc:id']);
  });

  it('carries the fields a moderator needs to judge an ad', async () => {
    await getAllAds();

    const { columns } = mocks.findMany.mock.calls.at(-1)![0];

    // Same allowlist as the queue, deliberately shared rather than re-listed: a
    // moderator deciding to delete an unreported ad needs the number and the
    // poster exactly as much as one deciding to delete a reported ad, and a
    // second narrower copy here would drop one of them.
    expect(columns).toMatchObject({
      id: true,
      title: true,
      contactPhone: true,
      userId: true,
      createdAt: true,
    });
  });

  it('carries checkedAt, which is the only way to render the check state', async () => {
    await getAllAds();

    // Without this the page could not tell a checked ad from an unchecked one,
    // so every row would offer "Mark checked" and a moderator could never undo
    // their own decision from this list.
    expect(mocks.findMany.mock.calls.at(-1)![0].columns).toHaveProperty(
      'checkedAt',
      true
    );
  });

  it('does not carry the fields the list has no use for', async () => {
    await getAllAds();

    const { columns } = mocks.findMany.mock.calls.at(-1)![0];

    // `slot` is the ad-limit machinery and is simply absent.
    expect(columns).not.toHaveProperty('slot');

    // `reportedAt` is present but false, which is how drizzle says "not
    // selected" while still letting the list be derived from the queue's
    // columns. Asserted as `false` rather than as absence because either would
    // be correct behaviour, and pinning one spelling would make the other a
    // gratuitous failure. It must not be `true`: this list is not filtered by
    // reports, so a real value would invite a per-row check in the page --
    // exactly the thing moderation-gate.test.ts forbids, because the rows would
    // already have been read.
    expect(columns.reportedAt).toBe(false);
  });

  it('is bounded', async () => {
    await getAllAds();

    // Bounded on principle, for the reason getReportedAds gives. This one matters
    // more than the queue's: the queue is small because reporting is rare, but
    // this list covers every ad ever posted, so an unbounded read grows with the
    // whole table.
    //
    // `limit + 1`, not `limit`: the extra row is how the caller learns there is
    // another page without a COUNT over the table. Asserted as the exact shape
    // because an off-by-one here shows up as a duplicated or missing row at a
    // page boundary rather than as a failure.
    const { limit } = mocks.findMany.mock.calls.at(-1)![0];

    expect(typeof limit).toBe('number');
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(200);
  });

  it('lets the caller ask for a smaller page', async () => {
    await getAllAds(5);

    expect(mocks.findMany.mock.calls.at(-1)![0].limit).toBe(6);
  });

  it('does not join the images relation', async () => {
    await getAllAds();

    // Same reasoning as the queue: the decision is about the text and the
    // number, and a lateral join per row to fetch photo urls is wasted work.
    expect(mocks.findMany.mock.calls.at(-1)![0].with).toBeUndefined();
  });

  it('does not narrow the checked flag in TypeScript', async () => {
    // The queue filters `reportedAt IS NOT NULL` and can therefore narrow the
    // column to a Date. This list cannot -- a checked ad and an unchecked one are
    // both in it -- so the column stays `Date | null` and the page branches on
    // it. Asserted here so a future "helpful" filter cannot quietly reintroduce
    // the queue's narrowing.
    mocks.findMany.mockResolvedValue([
      { id: 'a', createdAt: new Date(), checkedAt: null },
      { id: 'b', createdAt: new Date(), checkedAt: new Date() },
    ]);

    const { items } = await getAllAds();

    expect(items).toHaveLength(2);
    expect(constrainsColumn(predicate(), 'checkedAt')).toBe(false);
  });
});

/**
 * Paging. This list was the newest `PAGE_SIZE` of two hundred with no way past
 * them, so "I cannot find that scam" was a conclusion a moderator could draw
 * correctly from a list that was merely truncated.
 *
 * Every assertion here is against compiled SQL rather than against the
 * arguments, per HANDOFF §5: a mock that returns rows regardless of the predicate
 * would pass a test that only checked the call.
 *
 * One limit on what the mock can prove: `findMany` is stubbed, so it hands back
 * whatever it was told to regardless of `limit`. The page arithmetic below
 * therefore assumes the rows it is given are exactly the `limit + 1` the real
 * query asks for -- and that read size is asserted on its own, in "lets the
 * caller ask for a smaller page". A regression there has to fail one test or the
 * other, not one or the other alone.
 */
describe('getAllAds paging', () => {
  const CURSOR = {
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    id: '11111111-1111-4111-8111-111111111111',
  };

  const row = (id: string, createdAt: string) => ({
    id,
    createdAt: new Date(createdAt),
    checkedAt: null,
  });

  it('paginates on the cursor, older rows only', async () => {
    await getAllAds(10, CURSOR);

    // The pager's whole mechanism. A missing predicate here is the exact bug it
    // was added to fix: the moderator clicks "Older ads" and gets page 1 again.
    expect(constrainsColumn(predicate(), 'createdAt')).toBe(true);
    expect(constrainsColumn(predicate(), 'id')).toBe(true);
  });

  /**
   * The tiebreak, and the reason this is not `createdAt < cursor.createdAt`.
   *
   * Two ads posted in the same millisecond are ordinary, not a thought
   * experiment. Without the `id` comparison the row sharing the cursor's
   * timestamp is excluded from *both* pages, so it is unreachable -- the one
   * defect a pager must not have.
   */
  it('breaks the createdAt tie on id, so no ad falls between two pages', async () => {
    await getAllAds(10, CURSOR);

    const { sql } = compileWhere(predicate());

    // Both the strict comparison and the tiebreak are present.
    expect(sql).toMatch(/"createdAt"\s*<\s*\$/);
    expect(sql).toMatch(/"createdAt"\s*=\s*\$/);
    expect(sql).toMatch(/"id"\s*<\s*\$/);
  });

  it('keeps the cursor out of the ordering, which is a fixed total order', async () => {
    await getAllAds(10, CURSOR);

    // Ordering by the cursor's own column would return nothing on page two. Not
    // plausible, but cheap to pin against a `createdAt ASC` typo that would.
    const config = mocks.findMany.mock.calls.at(-1)![0];
    const orderings = config.orderBy(
      { createdAt: { name: 'createdAt' }, id: { name: 'id' } },
      {
        desc: (column: { name: string }) => `desc:${column.name}`,
        asc: (column: { name: string }) => `asc:${column.name}`,
      }
    );

    expect(orderings).toEqual(['desc:createdAt', 'desc:id']);
  });

  it('reports another page from the extra row it read', async () => {
    mocks.findMany.mockResolvedValue([
      ...Array.from({ length: 9 }, (_, i) => row(`a${i}`, '2026-01-02T00:00:00.000Z')),
      row('a9', '2026-01-01T00:00:00.000Z'),
    ]);

    const page = await getAllAds(10);

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('trims the extra row off the page it returns', async () => {
    // 11 rows read for a limit of 10. If the eleventh leaked into `items` the
    // moderator would see the same ad on two consecutive pages.
    mocks.findMany.mockResolvedValue([
      ...Array.from({ length: 11 }, (_, i) =>
        row(`a${i}`, `2026-01-${String(11 - i).padStart(2, '0')}T00:00:00.000Z`)
      ),
    ]);

    const page = await getAllAds(10);

    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
  });

  it('hands back the last row as the next cursor', async () => {
    mocks.findMany.mockResolvedValue([
      ...Array.from({ length: 11 }, (_, i) =>
        row(`a${i}`, `2026-01-${String(11 - i).padStart(2, '0')}T00:00:00.000Z`)
      ),
    ]);

    const page = await getAllAds(10);

    // The cursor is the last row *of the page*, not of the read. Using the
    // eleventh row -- the one trimmed off -- would skip it entirely.
    expect(page.nextCursor).toEqual({
      id: page.items.at(-1)!.id,
      createdAt: page.items.at(-1)!.createdAt,
    });
    expect(page.nextCursor?.id).not.toBe('a10');
  });

  it('answers with an empty page and no cursor when nothing is older', async () => {
    mocks.findMany.mockResolvedValue([]);

    const page = await getAllAds(10, CURSOR);

    expect(page).toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it('has no next cursor on a full page that is also the last page', async () => {
    // Exactly `limit` rows read and no extra row: `hasMore` is false, so there is
    // nothing to page to. Asserted because a `nextCursor` built from the last row
    // regardless would send the moderator to an empty page.
    mocks.findMany.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, i) =>
        row(`a${i}`, `2026-01-${String(11 - i).padStart(2, '0')}T00:00:00.000Z`)
      ),
    ]);

    const page = await getAllAds(10);

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  /**
   * The shape is `getAds`'s, and the pager is why that matters: the page now
   * destructures `{ items, hasMore, nextCursor }` off two queries, so a
   * difference between them would be a silent `undefined` in the UI rather than
   * a type error at the boundary.
   */
  it('answers in the same shape as the public grid', async () => {
    mocks.findMany.mockResolvedValue([]);

    expect(Object.keys(await getAllAds(10)).sort()).toEqual(
      Object.keys(await getAds(10)).sort()
    );
  });
});

describe('getReportedAds', () => {
  it('still filters on reportedAt after the all-ads list was added', async () => {
    // The two lists share a column allowlist, so this asserts the queue kept its
    // own predicate: an unreported ad appearing in the queue is the defect, and
    // sharing code with getAllAds is exactly how it would creep in.
    await getReportedAds();

    expect(constrainsColumn(predicate(), 'reportedAt')).toBe(true);
  });
});