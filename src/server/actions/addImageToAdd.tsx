'use server';

import { db } from '../db';
import { images } from '../db/schema';

type addImageToAdProps = {
  adId: string;
  userId: string;
  url: string;
  fileKey: string;
};

export async function addImageToAd({
  adId,
  userId,
  url,
  fileKey,
}: addImageToAdProps) {
  // basic input validation
  if (!adId || !userId || !url || !fileKey) {
    throw new Error('adId, userId, and url are required');
  }

  // optional: basic URL validation
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid image URL');
  }

  // ensure ad exists
  const ad = await db.query.ads.findFirst({
    where: (t, { eq }) => eq(t.id, adId),
    columns: { id: true, userId: true },
  });

  if (!ad) {
    throw new Error('Ad not found');
  }

  // ensure user owns the ad (or is allowed to add images)
  if (ad.userId !== userId) {
    throw new Error('Not authorized to add images to this ad');
  }

  await db.insert(images).values({
    adId,
    userId,
    url,
    fileKey,
  });
}
