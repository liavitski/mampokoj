// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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
/**
 * `params` is passed even though the home page has no dynamic segment, because
 * `PageProps<'/'>` declares it and Next always supplies it. It resolves to `{}`
 * for a static route (`page.md`, "Static routes resolve `params` to `{}`"), so
 * `Promise.resolve({})` is what the router actually hands over.
 *
 * Module scope rather than inside the first `describe`, because the repeated-
 * parameter suite below needs the same two helpers and a second copy would be a
 * second thing to keep in sync with the page's props.
 */
const renderHome = (searchParams: Record<string, string | string[] | undefined>) =>
  Home({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  });

const markupOf = async (
  searchParams: Record<string, string | string[] | undefined>
) => renderToStaticMarkup(await renderHome(searchParams));

describe('home page cursor handling', () => {
  beforeEach(() => {
    getAds.mockReset();
    getAds.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });

  const cursorFor = async (
    searchParams: Record<string, string | string[] | undefined>
  ) => {
    await renderHome(searchParams);

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
    await renderHome({ cursorCreatedAt: AT, cursorId: ID });

    expect(getAds.mock.calls[0]![0]).toBe(PAGE_SIZE);
  });

  it('still renders a valid region alongside a broken cursor', async () => {
    await renderHome({
      region: 'PR',
      cursorCreatedAt: AT,
      cursorId: 'not-a-uuid',
    });

    expect(getAds.mock.calls[0]![1]).toBe('PR');
  });
});

/**
 * A repeated query parameter arrives as an **array**, and
 * `PageProps<'/'>['searchParams']` is the first type in this file to say so.
 *
 * The hand-written `{ region?: string }` this replaced asserted a single string,
 * which was never true: `/?region=PR&region=JM` has always produced an array, and
 * the page has always rendered "No ads found for this region" for it -- because
 * `isRegionCode(['PR','JM'])` compared an array against fourteen strings and
 * returned false. The behaviour did not change. What changed is that it is now a
 * decision with a name (`isUnreadableRegion`) instead of a consequence of a type
 * annotation being wrong.
 *
 * These assert the rendering, because the rendering is the contract: a page that
 * filters by the *first* value of a repeated parameter would be a different and
 * arguably wrong answer, and one that `?region=PR&region=NOPE` would show as a
 * Prague listing rather than as the hand-edited URL it is.
 */
describe('a repeated region parameter', () => {
  beforeEach(() => {
    getAds.mockReset();
    getAds.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });

  it('renders the unreadable-region message rather than a grid', async () => {
    expect(await markupOf({ region: ['PR', 'JM'] })).toContain(
      'No ads found for this region'
    );
  });

  /**
   * The load-bearing half. A repeated region must not reach the database at all,
   * and must not be silently resolved to one of the fourteen codes -- a page that
   * queried `region: 'PR'` for `?region=PR&region=NOPE` would be filtering by a
   * value the URL does not unambiguously contain.
   */
  it('never queries for one of the repeated values', async () => {
    await renderHome({ region: ['PR', 'JM'] });

    expect(getAds).not.toHaveBeenCalled();
  });

  /**
   * The two cases must stay distinct, and this is the one that could regress
   * quietly. An absent `region` means "no filter, show everything"; an
   * unreadable one means "a filter was asked for and cannot be read". Collapsing
   * them would make every hand-edited URL render the whole site, which is both
   * wrong and a much larger response than the one asked for.
   */
  it('is not the same as no region at all, which still queries unfiltered', async () => {
    await renderHome({});

    expect(getAds).toHaveBeenCalledTimes(1);
    expect(getAds.mock.calls[0]![1]).toBeUndefined();
    expect(await markupOf({})).not.toContain('No ads found for this region');
  });

  /**
   * A single unknown code is the pre-existing behaviour and must not have been
   * disturbed while the array case was being handled -- same message, same
   * absence of a query.
   */
  it('reads exactly like a single unknown code', async () => {
    expect(await markupOf({ region: 'NOPE' })).toEqual(
      await markupOf({ region: ['PR', 'JM'] })
    );

    await renderHome({ region: 'NOPE' });
    expect(getAds).not.toHaveBeenCalled();
  });
});