'use server';

import { redirect } from 'next/navigation';
import { db } from '../db';
import { images } from '../db/schema';
import { revalidatePath } from 'next/cache';

export type AddImageToAdProps = {
  adId: string;
  url: string;
  fileKey: string;
  userId: string;
};

export async function addImageToAd({
  adId,
  url,
  fileKey,
  userId,
}: AddImageToAdProps) {
  try {
    const ad = await db.query.ads.findFirst({
      where: (t, { eq }) => eq(t.id, adId),
      columns: { id: true, userId: true },
    });

    if (!ad) {
      return { success: false, error: 'Ad not found' };
    }

    if (ad.userId !== userId) {
      return { success: false, error: 'Forbidden' };
    }

    await db.insert(images).values({
      adId,
      url,
      fileKey,
    });
    
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
