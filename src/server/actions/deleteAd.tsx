'use server';

import { eq } from 'drizzle-orm';

import { db } from '../db';
import { ads, images } from '../db/schema';
import { findAdOwnedByCurrentUser } from '@/lib/ads';
import { utapi } from '@/app/api/uploadthing/core';

export async function deleteAdById(adId: string) {
  const owned = await findAdOwnedByCurrentUser(adId);

  if (!owned) {
    return { success: false, error: 'Not found' };
  }

  try {
    const imagesToDelete = await db.query.images.findMany({
      where: (t, { eq }) => eq(t.adId, adId),
      columns: { fileKey: true },
    });

    if (imagesToDelete.length) {
      await utapi.deleteFiles(imagesToDelete.map((i) => i.fileKey));
    }

    // Images cascade in the database, but the rows are removed explicitly so
    // the upload bucket and the database cannot drift apart if the cascade is
    // ever dropped.
    await db.delete(images).where(eq(images.adId, adId));
    await db.delete(ads).where(eq(ads.id, adId));

    return { success: true, userId: owned.userId };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to delete ad', adId);

    return { success: false, error: 'Could not delete the ad' };
  }
}
