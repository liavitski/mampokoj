import 'server-only';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { ads } from '../db/schema';
import { z } from 'zod';
import { PAGE_SIZE } from '@/constants';
import type { AdsCursor } from '@/types/db-types';

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

export async function getAdsWithImages() {
  const adsWithImages = await db.query.ads.findMany({
    with: {
      images: true,
    },
    orderBy: (model, { desc }) => desc(model.createdAt),
    limit: 10,
  });

  return adsWithImages;
}

async function getAdWithImagesById(id: string) {
  const adWithImages = await db.query.ads.findFirst({
    where: eq(ads.id, id),
    with: {
      images: true,
    },
  });

  if (!adWithImages) {
    throw new Error('Ad not found');
  }

  return adWithImages;
}

const adIdSchema = z.uuid();

export async function getValidatedAd(adId: string) {
  const parsed = adIdSchema.safeParse(adId);

  if (!parsed.success) return null;

  return await getAdWithImagesById(parsed.data);
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
