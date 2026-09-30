import 'server-only';

import { db } from '../db';
import { eq, count } from 'drizzle-orm';
import { ads, images } from '../db/schema';
import { PAGE_SIZE } from '@/constants';
import { adIdSchema } from '@/lib/validation/ad-schema';
import type { AdsCursor } from '@/types/db-types';

/**
 * Columns safe to send to any client.
 *
 * `userId` is the poster's OAuth account id and `contactPhone` is personal
 * contact data. Neither belongs in a list of ads, so they are excluded at the
 * query rather than stripped on the way out -- the columns are never loaded.
 * `getValidatedAd` is the separate, deliberate path for a single ad's details.
 */
const publicAdColumns = {
  id: true,
  title: true,
  price: true,
  city: true,
  region: true,
  availableFrom: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const getAds = async (
  limit = PAGE_SIZE,
  region?: string,
  cursor?: AdsCursor
) => {
  const adsPage = await db.query.ads.findMany({
    where: (ads, { and, eq, lt, or }) => {
      const base = region ? eq(ads.region, region) : undefined;

      const pagination = cursor
        ? or(
            lt(ads.createdAt, cursor.createdAt),
            and(
              eq(ads.createdAt, cursor.createdAt),
              lt(ads.id, cursor.id)
            )
          )
        : undefined;

      return and(base, pagination);
    },

    columns: publicAdColumns,

    limit: limit + 1,

    orderBy: (ads, { desc }) => [desc(ads.createdAt), desc(ads.id)],

    with: {
      images: {
        limit: 1,
        orderBy: (img, { desc }) => [desc(img.createdAt)],
      },
    },
  });

  const hasMore = adsPage.length > limit;
  const items = hasMore ? adsPage.slice(0, limit) : adsPage;

  if (items.length === 0) {
    return {
      items: [],
      hasMore: false,
      nextCursor: null as AdsCursor | null,
    };
  }

  const last = items[items.length - 1]!;

  return {
    items,
    hasMore,
    nextCursor: hasMore
      ? {
          createdAt: last.createdAt,
          id: last.id,
        }
      : null,
  };
};

/**
 * Loads a single ad with its photos.
 *
 * Returns `null` when there is no such ad, rather than throwing. Both callers
 * turn a null into `notFound()`, so throwing here replaced a 404 page with an
 * error page every time somebody followed a link to a deleted ad.
 */
export async function getValidatedAd(adId: string) {
  const parsed = adIdSchema.safeParse(adId);

  if (!parsed.success) return null;

  const adWithImages = await db.query.ads.findFirst({
    where: eq(ads.id, parsed.data),
    with: {
      images: true,
    },
  });

  return adWithImages ?? null;
}

// Dashboard page
export async function getUserAds(userId: string) {
  const userAds = await db.query.ads.findMany({
    where: eq(ads.userId, userId),
    with: {
      images: true,
    },
    orderBy: (ads, { desc }) => [desc(ads.createdAt)],
  });

  return userAds;
}

// Uploadthing core
export async function imageLimit(adId: string, limit = 3) {
  const result = await db
    .select({ value: count(images.id) })
    .from(images)
    .where(eq(images.adId, adId));

  const imageCount = result[0]?.value ?? 0;

  return {
    success: imageCount < limit,
    count: imageCount,
    limit,
  };
}
