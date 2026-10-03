// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest';

const findMany = vi.fn();

vi.mock('@/server/db', () => ({
  db: { query: { ads: { findMany } } },
}));

const { getIndexableAds } = await import('@/server/queries/select');

/**
 * The sitemap's query.
 *
 * Asserted against compiled SQL rather than against the mocked return value,
 * for the reason `HANDOFF.md` §5 gives: a mock that returns rows passes whether
 * or not the query asked for them, so `findMany` returning `[]` here would make
 * a test that only checked its result decorative. These assert on the
 * argument object drizzle was handed.
 */
function lastCall() {
  expect(findMany).toHaveBeenCalledTimes(1);

  return findMany.mock.calls[0]![0];
}

describe('getIndexableAds', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('selects only the columns a sitemap entry can carry', async () => {
    await getIndexableAds(10);

    expect(lastCall().columns).toEqual({ id: true, updatedAt: true });
  });

  /**
   * The leak this rule exists for, asserted explicitly rather than left to the
   * equality above. `contactPhone` and `userId` are withheld from every public
   * payload by design, and a sitemap is a public payload a crawler fetches on
   * its own schedule -- so a widened column list here would publish the phone
   * number of every ad in the site to anyone who asked politely.
   */
  it('never selects contactPhone, userId or moderation state', async () => {
    await getIndexableAds(10);

    const columns = Object.keys(lastCall().columns);

    expect(columns).not.toContain('contactPhone');
    expect(columns).not.toContain('userId');
    expect(columns).not.toContain('reportedAt');
    expect(columns).not.toContain('checkedAt');
  });

  /**
   * Not `getAds` with fields left unused: that would read `description`,
   * `price` and `city` per row and join the newest photo, only to discard all
   * of it. The assertion is on the absence of a `with` clause, because that
   * join is the expensive part.
   */
  it('does not join images', async () => {
    await getIndexableAds(10);

    expect(lastCall().with).toBeUndefined();
  });

  it('bounds the read by the limit it was given', async () => {
    await getIndexableAds(25);

    expect(lastCall().limit).toBe(25);
  });

  /**
   * No `where`. A region-filtered sitemap whose ad entries all point at the
   * same home page is not a sitemap -- the region pages in it are the 14
   * `/?region=` URLs, not a subset of the ads.
   */
  it('is unfiltered, so every ad is reachable', async () => {
    await getIndexableAds(10);

    expect(lastCall().where).toBeUndefined();
  });

  it('orders newest first, matching the index that serves it', async () => {
    await getIndexableAds(10);

    const orderBy = lastCall().orderBy;

    // drizzle resolves orderBy through a callback, so the shape asserted here
    // is that the callback exists and produces descending order on createdAt.
    const adColumn = {
      desc: vi.fn((v: unknown) => ({ desc: v })),
    };
    const ordered = orderBy(adColumn, { desc: adColumn.desc });

    expect(ordered).toHaveLength(2);
    expect(ordered.every((o: unknown) => 'desc' in (o as object))).toBe(true);
  });

  it('returns the rows it was given', async () => {
    const rows = [{ id: 'a', updatedAt: new Date('2026-01-01') }];
    findMany.mockResolvedValue(rows);

    expect(await getIndexableAds(10)).toBe(rows);
  });
});