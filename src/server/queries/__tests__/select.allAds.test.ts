// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SQL } from 'drizzle-orm';

import { constrainsColumn } from '@/test/drizzle-where';

const { mocks } = vi.hoisted(() => ({ mocks: { findMany: vi.fn() } }));

vi.mock('@/server/db', () => ({
  db: { query: { ads: { findMany: mocks.findMany } } },
}));

const { getAllAds, getReportedAds } = await import('../select');

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
    const { limit } = mocks.findMany.mock.calls.at(-1)![0];

    expect(typeof limit).toBe('number');
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(200);
  });

  it('lets the caller ask for a smaller page', async () => {
    await getAllAds(5);

    expect(mocks.findMany.mock.calls.at(-1)![0].limit).toBe(5);
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
      { id: 'a', checkedAt: null },
      { id: 'b', checkedAt: new Date() },
    ]);

    const rows = await getAllAds();

    expect(rows).toHaveLength(2);
    expect(constrainsColumn(predicate(), 'checkedAt')).toBe(false);
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