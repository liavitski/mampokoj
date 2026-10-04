import { regionName } from './seo';
import { formatPriceCZK } from '@/utils/utils';

/**
 * What the generated Open Graph card for one ad is allowed to show.
 *
 * `getValidatedAd` selects the whole row, `contactPhone` and `userId` included,
 * because the detail page needs both. A share card needs neither: it is a
 * public image at a stable, guessable URL, fetched by crawlers, kept in platform
 * caches for days, and rendered to whoever the link was forwarded to. Anything
 * in it is published.
 *
 * So the mapping is an explicit allowlist rather than a filtered copy of the
 * row, and it lives here -- a pure module with no `ImageResponse`, no database
 * and no React -- so "the card cannot show a phone number" is a unit test on a
 * value rather than a promise about pixels. `opengraph-image.tsx` composes
 * layout; this decides what may be composed.
 */

/**
 * The columns this reads. Declared rather than taken as `typeof ad`, so a new
 * column cannot become card content by arriving in the query: adding one here is
 * a decision, and `Object.keys` in the test is what proves it was not made by
 * accident.
 */
export type CardAd = {
  title: string;
  city: string;
  price: string | number;
  region: string;
  images: { url: string }[];
};

export type OgCardData = {
  title: string;
  city: string;
  /** Already formatted for a Czech reader: "8 000 Kč". */
  price: string;
  /** The Czech region name, or `null` for a code this app does not know. */
  region: string | null;
  /**
   * The photo to draw, or `null`.
   *
   * `null` means two different things -- the ad has no photo, and the one it has
   * could not be loaded -- and both end in the same text-only layout. Which one
   * it was is the route's business; it needs a value that cannot be a URL.
   */
  photoUrl: string | null;
};

export function adCardData(ad: CardAd): OgCardData {
  return {
    title: ad.title,
    city: ad.city,
    price: formatPriceCZK(ad.price),
    region: regionName(ad.region),
    photoUrl: ad.images[0]?.url ?? null,
  };
}