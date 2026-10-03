import type { MetadataRoute } from 'next';

import { absoluteUrl, siteOrigin } from '@/lib/seo';

/**
 * `robots.txt`.
 *
 * `allow: '/'` with the three private surfaces disallowed. `/api` is route
 * handlers rather than pages; `/dashboard` and `/moderation` are the signed-in
 * ones, and `/moderation` in particular holds every reported ad's contact
 * number in its HTML.
 *
 * **These pages also carry `robots: { index: false }` metadata, and both are
 * needed.** `robots.txt` stops a *compliant* crawler fetching the page, which
 * means it never reads the `noindex` tag -- so a URL can sit in an index as
 * "indexed, though blocked by robots.txt", which is a worse state than either
 * indexed or absent. The metadata is what removes it, and it is what a
 * non-compliant fetcher (a chat previewer, a scraper) will honour.
 *
 * `host` and `sitemap` both come from `siteOrigin()`, so they cannot name a
 * different origin than the canonicals do.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/moderation'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteOrigin(),
  };
}