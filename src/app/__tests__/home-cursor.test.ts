// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest';

const getAds = vi.fn();

vi.mock('@/server/queries/select', () => ({
  getAds: (...args: unknown[]) => getAds(...args),
}));

vi.mock('@/components/RegionNavigation', () => ({ default: () => null }));
vi.mock('@/components/AdGrid', () => ({ default: () => null }));
vi.mock('@/components/RegionSelectBlock', () => ({ default: () => null }));

const { default: Home } = await import('@/app/page');
const { PAGE_SIZE } = await import('@/constants');

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-01-15T10:00:00.000Z';

/**
 * What the home page hands the cursor to, which is the whole of the fix.
 *
 * The 500 was never about rendering: `page.tsx` passed the raw query-string
 * values into `getAds`, where a non-uuid is `invalid input syntax for type uuid`
 * and a non-date is `RangeError: Invalid time value`. Both are throws, and an
 * unhandled throw in a server component is a 500, so `/?cursorId=not-a-uuid`
 * took the whole listing down. Asserting the *arguments* rather than the markup
 * is what pins this: a page that renders fine while still passing a raw string
 * through would look green and keep the bug.
 */
describe('home page cursor handling', () => {
  beforeEach(() => {
    getAds.mockReset();
    getAds.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });

  const cursorFor = async (searchParams: Record<string, string>) => {
    await Home({ searchParams: Promise.resolve(searchParams) });

    return getAds.mock.calls[0]![2];
  };

  it('passes a valid cursor through, so pagination still works', async () => {
    expect(await cursorFor({ cursorCreatedAt: AT, cursorId: ID })).toEqual({
      createdAt: new Date(AT),
      id: ID,
    });
  });

  it('queries the first page when there is no cursor', async () => {
    expect(await cursorFor({ region: 'PR' })).toBeUndefined();
  });

  /**
   * The central claim. Page 1, not an error page: a Next page has no 400 to
   * offer, and a 404 would be false -- the URL is a valid listing, just with an
   * unreadable position on it.
   */
  it('treats an unparseable cursor id as no cursor rather than throwing', async () => {
    expect(
      await cursorFor({ cursorCreatedAt: AT, cursorId: 'not-a-uuid' })
    ).toBeUndefined();
  });

  it('treats an unparseable timestamp as no cursor rather than throwing', async () => {
    expect(
      await cursorFor({ cursorCreatedAt: 'not-a-date', cursorId: ID })
    ).toBeUndefined();
  });

  it('ignores a lone id, which is the other way to reach the query', async () => {
    expect(await cursorFor({ cursorId: ID })).toBeUndefined();
  });

  it('ignores a lone timestamp', async () => {
    expect(await cursorFor({ cursorCreatedAt: AT })).toBeUndefined();
  });

  /**
   * The page still narrows to one page's worth, whatever the cursor says. A
   * cursor that made the limit unbounded would turn a junk URL into a table
   * dump; `PAGE_SIZE` is the same bound the first page gets.
   */
  it('keeps the page size bounded whatever the cursor says', async () => {
    await Home({
      searchParams: Promise.resolve({ cursorCreatedAt: AT, cursorId: ID }),
    });

    expect(getAds.mock.calls[0]![0]).toBe(PAGE_SIZE);
  });

  it('still renders a valid region alongside a broken cursor', async () => {
    await Home({
      searchParams: Promise.resolve({
        region: 'PR',
        cursorCreatedAt: AT,
        cursorId: 'not-a-uuid',
      }),
    });

    expect(getAds.mock.calls[0]![1]).toBe('PR');
  });
});