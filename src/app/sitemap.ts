import type { MetadataRoute } from 'next';

import { CZ_REGIONS } from '@/constants';
import { getIndexableAds } from '@/server/queries/select';
import { absoluteUrl, SITEMAP_AD_LIMIT } from '@/lib/seo';

/**
 * `sitemap.xml`: every URL on the site that should be indexed.
 *
 * Three kinds of entry, and the omissions are the interesting part:
 *
 * - `/` and the 14 `/?region=XX` URLs. The regions are listed because region
 *   filtering is the site's only internal structure, and a crawler that cannot
 *   reach a region page will never link to one. They are query-param URLs
 *   rather than path segments -- promoting them to `/region/[code]` was
 *   considered and declined, and the reason is recorded in `HANDOFF.md`: a new
 *   segment changes the route level at which the ad modal is intercepted, which
 *   silently stops the modal opening on region pages.
 *
 * - `/ad/<id>` for the newest `SITEMAP_AD_LIMIT` ads.
 *
 * **Not** `/dashboard/*`, `/moderation` or `/api/*`: private or non-HTML, and
 * `robots.ts` keeps crawlers off them as well. A sitemap entry is a request to
 * be indexed, so listing a private route would be the opposite of intent.
 *
 * `lastModified` is `updatedAt`, the column that moves when an ad is edited or
 * taken down. It is a crawler hint, and the honest one: a takedown moves it, so
 * a removed listing is re-fetched rather than sitting in the index on a stale
 * `createdAt`.
 *
 * No image sitemaps. `images.url` is currently populated with seeded rows whose
 * files no longer exist (`HANDOFF.md` §2.2), and advertising 200 dead image URLs
 * to Google would be worse than advertising none.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ads = await getIndexableAds(SITEMAP_AD_LIMIT);

  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'daily',
      priority: 1,
    },

    // `priority` is a hint every crawler ignores, but the ordering it encodes
    // is not nothing: the regions sit below the home page and above the ads,
    // which is the order a crawler should meet them in.
    ...CZ_REGIONS.map((region) => ({
      url: absoluteUrl(`/?region=${region.code}`),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),

    ...ads.map((ad) => ({
      url: absoluteUrl(`/ad/${ad.id}`),
      lastModified: ad.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}