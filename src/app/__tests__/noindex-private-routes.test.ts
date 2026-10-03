// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

vi.mock('@/server/queries/select', () => ({
  getUserAds: vi.fn().mockResolvedValue([]),
  getAllAds: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
  getReportedAds: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/server/db', () => ({
  db: { query: { ads: { findMany: vi.fn().mockResolvedValue([]) } } },
}));
vi.mock('@/lib/session', () => ({
  requireUserId: vi.fn().mockResolvedValue('user-1'),
  getCachedSession: vi.fn().mockResolvedValue(null),
  getSessionUser: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/RoomListingForm', () => ({ default: () => null }));
vi.mock('@/components/AdCard', () => ({ default: () => null }));
vi.mock('@/components/UploadBtn', () => ({ default: () => null }));
vi.mock('@/components/DeleteAdButton', () => ({ default: () => null }));
vi.mock('@/components/UpdateRoomListingForm', () => ({
  default: () => null,
}));



/**
 * Every private route must say `noindex`, and none of them may rely on
 * `robots.txt` alone.
 *
 * The reasoning is the same for all three and it is worth stating once: a URL
 * excluded in `robots.txt` **never gets its `noindex` tag read**, because the
 * exclusion is why the crawler did not fetch it. So `robots.txt` alone leaves
 * these routes in an index as "indexed, though blocked by robots.txt" -- a
 * worse state than either indexed or absent, and one that keeps the moderation
 * page (which carries every reported ad's contact number in its HTML) on the
 * record.
 *
 * These read the exported `metadata` objects directly. Asserting on rendered
 * output would be the weaker claim: a tag that is present in the export but
 * overwritten by a layout could render correctly and still be wrong, whereas
 * this fails the moment the export is removed.
 */
describe('private routes are not indexable', () => {
  it('the dashboard is noindex, follow: false', async () => {
    const { metadata } = await import('@/app/dashboard/[userId]/page');

    expect(metadata?.robots).toEqual({ index: false, follow: false });
  });

  it('the moderation queue is noindex, follow: false', async () => {
    const { metadata } = await import('@/app/moderation/page');

    expect(metadata?.robots).toEqual({ index: false, follow: false });
  });

  /**
   * The 404 page: Next.js emits `noindex` automatically for a 404 **status**, so
   * declaring it here produced two `robots` tags on the page (verified against a
   * production build). More importantly, that automatic tag only appears because
   * the status fix in `(browse)/loading.tsx` made a missing ad answer 404 at all
   * -- before it, a 200 got no automatic `noindex`, so a removed listing stayed
   * indexable on its own merits.
   *
   * So this asserts the *absence* of a redundant declaration, and the presence of
   * a title, which the built-in one does not provide.
   */
  it('the 404 page declares no redundant robots tag but does declare a title', async () => {
    const { metadata } = await import('@/app/not-found');

    expect(metadata?.robots).toBeUndefined();
    expect(metadata?.title).toBe('Stránka nenalezena');
  });

  /**
   * The public routes must *not* inherit a noindex. A single stray
   * `robots: { index: false }` on the root layout would deindex the entire site
   * while every route-specific test above still passed -- they assert what their
   * own route says, not what it inherits.
   */
  it('the root layout does not noindex the site', async () => {
    // Read from `metadata.ts`, which `layout.tsx` re-exports. Importing the
    // layout itself needs `next/font/google` and the UploadThing SSR plugin
    // stubbed out, and a test that has to stub half the component tree to reach
    // one object is a test that stops being run.
    const { rootMetadata } = await import('@/app/metadata');

    expect(rootMetadata.robots).toBeUndefined();
  });

  /**
   * The layout must re-export rather than redefine, or the two drift and the
   * one Next.js actually reads is the untested copy.
   */
  it('the layout re-exports the metadata it is given', async () => {
    const layoutSource = await readFile(
      new URL('../layout.tsx', import.meta.url),
      'utf8'
    );

    expect(layoutSource).toContain('export const metadata = rootMetadata');
    expect(layoutSource).toContain('export const viewport = rootViewport');
  });
});

describe('the browse loading boundary is scoped, not global', () => {
  /**
   * The structural half of the 404 fix, asserted directly against the file
   * system rather than only through the HTTP behaviour.
   *
   * The 404-status assertion lives in `e2e/ad-detail.spec.ts`, where it is
   * measured against a real server. This is the cheap guard that fails first
   * and names the cause: a `loading.tsx` at the app root puts a Suspense
   * boundary above every route, which is what commits the response head before
   * a page's data has loaded.
   */
  it('no loading.tsx exists at the app root', () => {
    expect(existsSync(join(process.cwd(), 'src/app/loading.tsx'))).toBe(false);
  });

  /**
   * The grid keeps its loading state, just not from a place that wraps the ad
   * route.
   *
   * Scoping it by route group -- `src/app/(browse)/loading.tsx`, with the home
   * page moved into `(browse)` -- was tried first and **broke the intercepting
   * modal**, which is why this is asserted and not just documented: with the
   * home page one route-group level deeper, `@modal/(.)ad/[adId]` stopped
   * matching, and every card click became a full page navigation. Four
   * `ad-detail.spec.ts` modal specs failed; the URL still changed, so only the
   * "grid is still mounted behind it" assertions caught it.
   *
   * `(..)` is not an escape hatch -- Next.js rejects it at the root level
   * ("Cannot use (..) marker at the root level, use (.) instead"), so the
   * matcher cannot simply be re-aimed one level up.
   */
  it('the browse grid keeps its loading state outside the ad route', () => {
    expect(
      existsSync(join(process.cwd(), 'src/app/(browse)/loading.tsx'))
    ).toBe(true);
  });

  /**
   * The home page must stay at the app root, directly under the layout that owns
   * the `@modal` slot. This is the structural half of the note above: the
   * intercepting route is matched by segment level relative to its slot, so
   * moving the home page into a group changes what `(.)` resolves to.
   */
  it('the home page sits at the app root, beside the modal slot', () => {
    expect(existsSync(join(process.cwd(), 'src/app/page.tsx'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/app/(browse)/page.tsx'))).toBe(
      false
    );
  });

  /**
   * And the ad route specifically must have no boundary above it, or the
   * `notFound()` it calls cannot set a status.
   */
  it('the ad detail route has no loading boundary of its own', () => {
    expect(
      existsSync(join(process.cwd(), 'src/app/ad/[adId]/loading.tsx'))
    ).toBe(false);
  });

  
});