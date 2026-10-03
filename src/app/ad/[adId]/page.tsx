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
 * The image is the ad's own photo when it has one. Every seeded ad currently
 * points at a file that no longer exists (`HANDOFF.md` §2.2), so this can be a
 * dead URL in development -- which is a reason to fix the seed, not to
 * hardcode a placeholder that would override a real photo the moment one exists.
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
  const image = ad.images[0]?.url;

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
      ...(image ? { images: [{ url: image, alt: ad.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ad.title,
      description,
      ...(image ? { images: [image] } : {}),
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
