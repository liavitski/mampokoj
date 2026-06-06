'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { utapi } from '@/app/api/uploadthing/core';

export async function deleteAdById(adId: string) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;

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

  if (imagesToDelete.length) {
    await utapi.deleteFiles(imagesToDelete.map((i) => i.fileKey));
  }

  await db.delete(ads).where(eq(ads.id, adId));
}

export async function deleteAdAction(adId: string) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  await deleteAdById(adId);

  revalidatePath(`/dashboard/${sessionUserId}`);
}
