import { ImageResponse } from 'next/og';

import { APP_TITLE, LIGHT_TOKENS } from '@/constants';
import { SITE_DESCRIPTION } from '@/lib/seo';

/**
 * The card a shared home-page link gets.
 *
 * The site root is the root *segment*, so this card is also inherited by
 * `/dashboard/[userId]`, `/moderation` and the 404. Those routes are `noindex`
 * and disallowed in `robots.txt`, so nothing indexes the picture, and none of
 * them draws an ad's data through it -- this file reads no database at all, which
 * `site-opengraph-image.test.tsx` enforces by making the queries throw.
 *
 * `/ad/[adId]` overrides this with a card of its own.
 *
 * Static on purpose: no request-time API, no data, so it renders once and every
 * share after that is a cached file.
 */
export const alt = `${APP_TITLE} — ${SITE_DESCRIPTION}`;

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: LIGHT_TOKENS['--color-background'],
          color: LIGHT_TOKENS['--color-text'],
          fontFamily: 'sans-serif',
          padding: 96,
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 800,
            color: LIGHT_TOKENS['--color-primary'],
          }}
        >
          {APP_TITLE}
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 40,
            // The muted token, not a grey picked here: this is the same sentence
            // the metadata description and the footer carry, and a card that
            // drifted from the site copy would be one more thing to keep in step.
            color: LIGHT_TOKENS['--color-text-muted-foreground'],
            textAlign: 'center',
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}