// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest';

const getAds = vi.fn();

vi.mock('@/server/queries/select', () => ({
  getAds: (...args: unknown[]) => getAds(...args),
}));

vi.mock('@/components/RegionNavigation', () => ({ default: () => null }));
vi.mock('@/components/AdGrid', () => ({ default: () => null }));
vi.mock('@/components/RegionSelectBlock', () => ({ default: () => null }));

const { generateMetadata } = await import('@/app/page');
const { SITE_DESCRIPTION } = await import('@/lib/seo');

/**
 * The home page's canonical URL, which is the one piece of metadata here with
 * a consequence rather than a description.
 *
 * The grid paginates by cursor in the query string, so `/?region=PR` has ~20
 * siblings that render the *second, third, fourth* page of the same listing.
 * Self-referencing canonicals on all of them would tell a crawler they are 20
 * distinct documents competing with each other, and the region page the index
 * keeps would be whichever one it happened to reach. Pointing every one of them
 * at `/?region=PR` states the relationship that is actually true.
 */
describe('home page metadata', () => {
  beforeEach(() => {
    getAds.mockReset();
    getAds.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';
  });

  const meta = (searchParams: Record<string, string>) =>
    generateMetadata({ searchParams: Promise.resolve(searchParams) });

  it('canonicalises the bare grid to the site root', async () => {
    expect((await meta({})).alternates?.canonical).toBe('/');
  });

  it('keeps a valid region in its canonical', async () => {
    expect((await meta({ region: 'PR' })).alternates?.canonical).toBe(
      '/?region=PR'
    );
  });

  /**
   * The central claim. `cursorCreatedAt` and `cursorId` are the infinite
   * scroll's position, not a filter, so they must not reach the canonical.
   */
  it('drops the pagination cursor from the canonical', async () => {
    const result = await meta({
      region: 'PR',
      cursorCreatedAt: '2026-01-15T10:00:00.000Z',
      cursorId: 'ad-42',
    });

    const canonical = String(result.alternates?.canonical);

    expect(canonical).toBe('/?region=PR');
    expect(canonical).not.toContain('cursor');
  });

  it('drops a cursor even with no region selected', async () => {
    const result = await meta({
      cursorCreatedAt: '2026-01-15T10:00:00.000Z',
      cursorId: 'ad-42',
    });

    expect(result.alternates?.canonical).toBe('/');
  });

  /**
   * `page.tsx` renders "No ads found for this region" for a bad code, so a
   * self-referencing canonical would invite an empty result page to be indexed
   * as a thin duplicate of the root.
   */
  it('canonicalises an unknown region to the root, not to itself', async () => {
    expect((await meta({ region: 'NOPE' })).alternates?.canonical).toBe('/');
  });

  it('names the region in the title, so region pages are not 14 copies', async () => {
    expect((await meta({ region: 'JM' })).title).toContain('Jihomoravský kraj');
  });

  it('mirrors the title into og:title so a shared link agrees with the tab', async () => {
    const result = await meta({ region: 'PR' });

    expect(result.openGraph).toMatchObject({ title: result.title });
  });

  /**
   * Relative, and matching the canonical exactly.
   *
   * `metadataBase` in `metadata.ts` resolves this to an absolute URL when the
   * page renders -- verified in a production build, where the emitted tag was
   * `<meta property="og:url" content="http://localhost:3000/?region=PR">`.
   * The test asserts the *relative* form on purpose: `generateMetadata` returns
   * the object Next is handed, and a hardcoded absolute URL here would be a
   * second place to get the origin wrong.
   */
  it('sets og:url to the same URL as the canonical', async () => {
    const result = await meta({ region: 'PR' });

    expect(result.openGraph).toMatchObject({ url: '/?region=PR' });
    expect(result.openGraph?.url).toBe(result.alternates?.canonical);
  });

  it('falls back to the site description with no region', async () => {
    expect((await meta({})).description).toBe(SITE_DESCRIPTION);
  });

  it('does not noindex the public grid', async () => {
    expect((await meta({})).robots).toBeUndefined();
  });
});