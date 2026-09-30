import type { AdsApiResponse, AdWithImages, PublicAd } from '@/types/db-types';

/**
 * An ad that may still be carrying the private columns.
 *
 * Both a full database row and an already-narrowed public ad satisfy this, so
 * the same guard works whether or not the query above it restricted the
 * selected columns.
 */
type AdPossiblyPrivate = PublicAd &
  Partial<Pick<AdWithImages, 'userId' | 'contactPhone'>>;

/**
 * Narrows an ad down to the fields that are safe to send to any client.
 *
 * The list query already excludes `userId` and `contactPhone` at the database
 * level, so this is a second, independent barrier: if a future query change
 * widened the selected columns, the response shape would not widen with it.
 *
 * Fields are listed rather than omitted on purpose. Adding a column to the ads
 * table leaves it out of this function, and because the return type is
 * `PublicAd`, TypeScript then fails until someone decides the new column is
 * safe to publish. A column becomes public deliberately, never by accident.
 */
export function toPublicAd(ad: AdPossiblyPrivate): PublicAd {
  return {
    id: ad.id,
    title: ad.title,
    price: ad.price,
    city: ad.city,
    region: ad.region,
    availableFrom: ad.availableFrom,
    description: ad.description,
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
    images: ad.images,
  };
}

/**
 * Narrows an untrusted parsed body to the ad list response.
 *
 * The grid spreads `data.items` straight into its state, so a 500 or an HTML
 * error page arriving where JSON was expected used to throw and blank the
 * whole page. Checking the shape first turns that into a handled error.
 */
export function isAdsApiResponse(value: unknown): value is AdsApiResponse {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<AdsApiResponse>;

  return (
    Array.isArray(candidate.items) &&
    typeof candidate.hasMore === 'boolean' &&
    (candidate.nextCursor === null ||
      (typeof candidate.nextCursor === 'object' &&
        candidate.nextCursor !== null &&
        typeof candidate.nextCursor.cursorId === 'string' &&
        typeof candidate.nextCursor.cursorCreatedAt === 'string'))
  );
}
