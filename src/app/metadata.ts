import type { Metadata, Viewport } from 'next';

import { APP_TITLE } from '@/constants';
import { SITE_DESCRIPTION, siteOrigin } from '@/lib/seo';

/**
 * The site-wide metadata and viewport.
 *
 * A separate module from `layout.tsx` for one reason: `layout.tsx` cannot be
 * imported by a test. It pulls in `next/font/google`, whose loaders only run
 * inside a Next build, and `@uploadthing/react/next-ssr-plugin`, which resolves
 * `next/navigation` in a way Vitest's ESM resolver rejects. Both are stubbable
 * but the stack of stubs needed to reach one exported object grows every time
 * the layout gains an import -- and the root metadata is exactly the kind of
 * thing that should be directly assertable, because a stray
 * `robots: { index: false }` here would deindex the whole site while every
 * route-specific test still passed.
 *
 * `layout.tsx` re-exports these, so Next.js still sees them on the layout and
 * this is not a second source of truth.
 */
export const rootMetadata: Metadata = {
  /**
   * Required by every URL-shaped field, and by the absolute URLs `sitemap.ts`
   * and `robots.ts` generate. Without it Next throws at build time on any
   * relative `openGraph.url` -- the one symptom that would have caught its
   * absence here, and which never fired because the app set no URL-shaped
   * metadata at all before this.
   */
  metadataBase: new URL(siteOrigin()),
  title: {
    template: `%s • ${APP_TITLE}`,
    default: APP_TITLE,
  },
  description: SITE_DESCRIPTION,
  applicationName: APP_TITLE,

  /**
   * Both cards rather than one: Facebook and LinkedIn read Open Graph, X reads
   * `summary_large_image`, and WhatsApp and Slack fall back to Open Graph.
   * Setting only `twitter` is why so many links share as a bare URL; setting
   * only `openGraph` leaves X guessing at the card size.
   *
   * No `images` here on purpose, and `src/app/opengraph-image.tsx` is where the
   * site card lives instead. Declaring the picture in the metadata object rather
   * than as a file convention is not merely a different spelling: the two
   * disagree about which wins *by environment* -- the metadata image is emitted
   * in development and dropped in a production build -- so a page that declared
   * both would advertise one picture to a developer and another to every
   * crawler. The file convention is the one authority that holds in both, and
   * `/ad/[adId]` overrides it with a card of its own.
   */
  openGraph: {
    type: 'website',
    siteName: APP_TITLE,
    locale: 'cs_CZ',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

/**
 * `themeColor` follows the system preference rather than the cookie.
 *
 * A `<meta name="theme-color">` is evaluated by the user agent before any
 * script runs, so it cannot read the cookie the app themes itself from. Two
 * media-query entries are the honest version of that: a visitor who chose dark
 * mode in the app but has the OS on light will see a light browser chrome
 * around a dark page, and inverting this to follow the cookie is not possible.
 *
 * The two hexes are the app's own `--color-background` tokens resolved
 * (`hsl(20deg 5.8% 90%)` and `hsl(30deg 11% 10.5%)`), so the browser UI sits
 * against the same background the page paints.
 */
export const rootViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e7e5e4' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1b18' },
  ],
};