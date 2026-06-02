import 'server-only';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { ads } from '../db/schema';
import { z } from 'zod';

export async function getAds() {
  const first10Ads = await db.query.ads.findMany({ limit: 10 });

  return first10Ads;
}

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

// Ad Page

export async function getUserAdsByUserId(userId: string) {
  const userAds = await db
    .select()
    .from(ads)
    .where(eq(ads.userId, userId)); // selecting all user ads by user id

  const adIds = userAds.map((a) => a.id); // getting
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
