'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/require-user-id';

import { utapi } from '@/app/api/uploadthing/core';

export async function deleteAdById(adId: string) {
  try {
    const sessionUserId = await requireUserId();

    if (!sessionUserId) {
      return { success: false, error: 'Unauthorized' };
    }

    const ad = await db.query.ads.findFirst({
      where: (t, { eq }) => eq(t.id, adId),
      columns: { id: true, userId: true },
    });

    if (!ad) {
      return { success: false, error: 'Ad not found' };
    }

    if (ad.userId !== sessionUserId) {
      return { success: false, error: 'Forbidden' };
    }

    const imagesToDelete = await db.query.images.findMany({
      where: (t, { eq }) => eq(t.adId, adId),
      columns: { fileKey: true },
    });

    if (imagesToDelete.length) {
      await utapi.deleteFiles(imagesToDelete.map((i) => i.fileKey));
    }

    await db.delete(ads).where(eq(ads.id, adId));

    return {
      success: true,
      userId: sessionUserId,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
