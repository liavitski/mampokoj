import { getValidatedAd } from '@/server/queries/select';

import { cache } from 'react';
import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import AdCardCompact from '@/components/AdCard/AdCardCompact';
import { absoluteUrl, adMetaDescription } from '@/lib/seo';
import { APP_TITLE } from '@/constants';
import AdStructuredData from './ad-structured-data';

type AdPageProps = {
  params: Promise<{ adId: string }>;
};

/**
 * One read per request, shared by the metadata and the page.
 *
 * `generateMetadata` and the page component both need this ad, and without
 * `cache` that is two identical queries on every request to `/ad/[adId]` --
 * including the crawler requests that make a sitemap worth having. `cache` is
 * request-scoped, so it dedupes within a render without leaking between
 * requests, which is the same arrangement `lib/session.ts` uses for the
 * session.
 *
 * Wrapped here rather than inside `getValidatedAd` so the memoisation is a
 * property of *this route* and the query itself stays a plain function. The
 * intercepting modal at `@modal/(.)ad/[adId]` calls `getValidatedAd`
 * directly and deliberately does not share this cache -- it renders on a
 * navigation where the grid behind it is already loaded.
 */
const getAd = cache(getValidatedAd);

/**
 * Metadata for one listing.
 *
 * A share card is the whole point: an ad shared into a chat is the single most
 * likely way this URL is opened by somebody who never saw the grid, and
 * without `openGraph` it arrives as a bare link with the page title repeated
 * above it.
 *
 * **No `images` here, deliberately.** The picture comes from
 * `opengraph-image.tsx` in this segment, which draws the ad's own photo beside
 * its title, price, city and region. Leaving this object without an image is what
 * makes that file the single authority for the card -- and it has to be, because
 * the two disagree about who wins, *by environment*. Measured on both, same
 * commit, 16.3.6:
 *
 *   pnpm dev            og:image is the photo; no card is emitted at all
 *   production build    og:image is the generated card; the photo is dropped
 *
 * `generate-metadata.md:114` ("file-based metadata has the higher priority")
 * describes the second. Keeping both would mean the card exists only in
 * production while a developer opening the page sees the plain photo -- so the
 * card has to be verified against a build, never against `pnpm dev` alone.
 *
 * The cost of giving up the raw photo as `og:image`, stated so it is not later
 * mistaken for a regression: `og:image:alt` is the file's constant rather than
 * the ad's title, while the title and description beside the card are unchanged
 * and still per-ad. `metadata-routes.test.ts` pins both halves.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ adId: string }>;
}): Promise<Metadata> {
  const { adId } = await params;
  const ad = await getAd(adId);

  /**
   * Null rather than throwing. A crawler that requests a removed listing gets
   * the same 404 the visitor does, and `not-found.tsx` carries
   * `robots: { index: false }`, so a dead ad leaves the index instead of
   * being re-crawled and re-submitted forever.
   */
  /**
   * No `robots` here on purpose. The page below calls `notFound()`, which
   * answers 404, and Next.js emits `<meta name="robots" content="noindex">` for
   * a 404 status automatically. Declaring it here too put two directives with
   * different values on one page, and a crawler reading both has no rule for
   * which wins.
   *
   * That makes the 404 *status* the single source of truth for this route --
   * which is why `(browse)/loading.tsx` must not move back to the app root, and
   * why `noindex-private-routes.test.ts` asserts that it has not.
   */
  if (!ad) {
    return { title: 'Inzerát nenalezen' };
  }

  const description = adMetaDescription(ad);
  const url = absoluteUrl(`/ad/${ad.id}`);

  return {
    title: ad.title,
    description,
    alternates: { canonical: `/ad/${ad.id}` },
    openGraph: {
      type: 'article',
      title: ad.title,
      description,
      url,
      siteName: APP_TITLE,
      locale: 'cs_CZ',
    },
    twitter: {
      card: 'summary_large_image',
      title: ad.title,
      description,
    },
  };
}

export default async function AdPage({ params }: AdPageProps) {
  const { adId } = await params;
  const ad = await getAd(adId);

  if (!ad) {
    notFound();
  }

  // userId is dropped rather than passed down: the compact card has no use for
  // the poster's account id.
  const { userId: _userId, ...adData } = ad;

  return (
    <>
      <AdCardCompact ad={adData} />
      <AdStructuredData ad={ad} />
    </>
  );
}
