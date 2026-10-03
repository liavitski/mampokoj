// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SQL } from 'drizzle-orm';

import { compileWhere, constrainsColumn } from '@/test/drizzle-where';

const { mocks } = vi.hoisted(() => ({ mocks: { findMany: vi.fn() } }));

vi.mock('@/server/db', () => ({
  db: { query: { ads: { findMany: mocks.findMany } } },
}));

const { getReportedAds } = await import('../select');

/** The `where` clause the query was built with, compiled to SQL text. */
function predicate(): SQL | undefined {
  return mocks.findMany.mock.calls.at(-1)![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe('getReportedAds', () => {
  it('returns only ads somebody has reported', async () => {
    await getReportedAds();

    // Without the predicate this returns every ad in the table -- 201 seeded
    // rows plus whatever is real. Drop the isNotNull and this fails, which is
    // the difference between a queue and the whole site.
    const clause = predicate();
    expect(constrainsColumn(clause, 'reportedAt')).toBe(true);
    expect(compileWhere(clause).sql).toContain('"reportedAt" is not null');
  });

  it('answers with the newest report first', async () => {
    await getReportedAds();

    // The most recent report is the one to look at; oldest-first would put the
    // stale end of the queue on screen.
    const config = mocks.findMany.mock.calls.at(-1)![0];
    const orderings = config.orderBy(
      { reportedAt: { name: 'reportedAt' } },
      { desc: (column: { name: string }) => `desc:${column.name}` }
    );

    expect(orderings).toEqual(['desc:reportedAt']);
  });

  it('carries the fields a moderator needs to judge a report', async () => {
    await getReportedAds();

    const { columns } = mocks.findMany.mock.calls.at(-1)![0];

    // contactPhone and userId are the whole basis of the report: a scam is
    // recognised by the number, and taking an ad down means knowing whose it
    // is. Reusing `publicAdColumns` here would quietly drop both and leave a
    // moderator unable to act on what they read.
    expect(columns).toMatchObject({
      id: true,
      title: true,
      contactPhone: true,
      userId: true,
      reportedAt: true,
    });
  });

  it('does not carry the fields the queue has no use for', async () => {
    await getReportedAds();

    const { columns } = mocks.findMany.mock.calls.at(-1)![0];

    // `slot` is the ad-limit machinery and `description` is prose a moderator
    // has no reason to read; neither needs to cross into the queue payload.
    expect(columns).not.toHaveProperty('slot');
  });

  it('is bounded', async () => {
    await getReportedAds();

    // Bounded on principle, for the reason `getUserAds` gives: MAX_ADS_PER_USER
    // caps what can be posted, but it is not the only thing that writes here,
    // and an unbounded read grows with whatever is in it.
    const { limit } = mocks.findMany.mock.calls.at(-1)![0];

    expect(typeof limit).toBe('number');
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(200);
  });

  it('lets the caller ask for a smaller page', async () => {
    await getReportedAds(5);

    expect(mocks.findMany.mock.calls.at(-1)![0].limit).toBe(5);
  });

  it('does not join the images relation', async () => {
    await getReportedAds();

    // Deciding whether to take an ad down is a decision about the text and the
    // number. Pulling photo rows for every reported ad would be a lateral join
    // per row for nothing.
    expect(mocks.findMany.mock.calls.at(-1)![0].with).toBeUndefined();
  });
});
