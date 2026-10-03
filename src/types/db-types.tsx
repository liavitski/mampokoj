import type { InferSelectModel } from 'drizzle-orm';
import { ads, images } from '@/server/db/schema';
import { CZ_REGIONS } from '@/constants';

export type Ad = InferSelectModel<typeof ads>;
export type Image = InferSelectModel<typeof images>;
export type AdWithImages = Ad & {
  images: Image[];
};

/**
 * A photo as it may be sent to any client. `fileKey` is the UploadThing
 * storage key and stays on the server; see PublicImage in lib/ad-dto.
 */
export type PublicImageRow = Pick<Image, 'id' | 'url' | 'createdAt'>;

/**
 * A single ad as shown on its own page, to any visitor.
 *
 * No `userId`, and photos without their storage key: only the owner's
 * dashboard can delete a photo, and only there is the key needed. No
 * `reportedAt` either -- the detail page is public, so moderation state has no
 * business in its payload.
 */
export type AdWithoutUserId = Omit<Ad, 'userId' | 'reportedAt'> & {
  images: PublicImageRow[];
};

/**
 * An ad as it may be sent to any client.
 *
 * `userId` is the poster's OAuth account id and `contactPhone` is personal
 * contact data, so neither travels in a list of ads. A single ad's contact
 * details are fetched separately and gated on the session. `slot` is which
 * of the user's ad slots the row occupies -- it exists so the database can
 * enforce the per-user limit, and a client has no use for it. `reportedAt` is
 * moderation state: publishing it would both label an ad as reported and, since
 * the queue filters on it, let anyone probe which ad ids are flagged.
 */
export type PublicAd = Omit<
  Omit<
    AdWithImages,
    'userId' | 'contactPhone' | 'slot' | 'reportedAt'
  >,
  'images'
> & {
  images: PublicImageRow[];
};

export type RegionCode = (typeof CZ_REGIONS)[number]['code'];

/**
 * API-safe cursor (client receives only strings)
 */
export type AdsApiCursor = {
  cursorCreatedAt: string;
  cursorId: string;
};

/**
 * API response (frontend contract — SOURCE OF TRUTH)
 */
export type AdsApiResponse = {
  items: PublicAd[];
  hasMore: boolean;
  nextCursor: AdsApiCursor | null;
};

/**
 * Cursor used internally (server-side)
 */
export type AdsCursor = {
  createdAt: Date;
  id: string;
};
