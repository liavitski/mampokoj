import type { InferSelectModel } from 'drizzle-orm';
import { ads, images } from '@/server/db/schema';
import { CZ_REGIONS } from '@/constants';

export type Ad = InferSelectModel<typeof ads>;
export type Image = InferSelectModel<typeof images>;
export type AdWithImages = Ad & {
  images: Image[];
};
export type AdWithImage = Ad & {
  images: Image;
};

export type AdWithoutUserIdAndPhone = Omit<
  AdWithImages,
  'userId' | 'contactPhone'
>;

export type AdWithoutUserId = Omit<AdWithImages, 'userId'>;

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
  items: AdWithImages[];
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
