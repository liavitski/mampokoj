'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/require-user-id';

import { utapi } from '@/app/api/uploadthing/core';

export async function deleteAdById(adId: string) {
  const sessionUserId = await requireUserId();

  if (!sessionUserId) throw new Error('Unauthorized');

  const ad = await db.query.ads.findFirst({
    where: (t, { eq }) => eq(t.id, adId),
    columns: { id: true, userId: true },
  });

  if (!ad) throw new Error('Ad not found');

  if (ad.userId !== sessionUserId) throw new Error('Forbidden');

  const imagesToDelete = await db.query.images.findMany({
    where: (t, { eq }) => eq(t.adId, adId),
    columns: { fileKey: true },
  });

  // Call to uploadthing server with data which images to delete
  if (imagesToDelete.length) {
    await utapi.deleteFiles(imagesToDelete.map((i) => i.fileKey));
  }

  await db.delete(ads).where(eq(ads.id, adId));
  revalidatePath(`/dashboard/${sessionUserId}`);
}