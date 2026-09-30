'use server';

import { and, eq, exists } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/server/db';
import { ads, images } from '@/server/db/schema';
import { requireUserId } from '@/lib/session';
import { utapi } from '@/app/api/uploadthing/core';

/** UploadThing file keys are URL-safe base64. */
const fileKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * Deletes one of the caller's own ad photos.
 *
 * Ownership is part of the photo query -- an EXISTS over the ads table,
 * correlated on the photo's ad -- so a photo is never loaded before its
 * ownership is settled. "Not yours" and "does not exist" collapse into one
 * answer, so the action cannot be used to discover which file keys exist.
 */
export async function deletePhotoByFileKey(fileKey: string) {
  const userId = await requireUserId();

  if (!userId) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsedFileKey = fileKeySchema.safeParse(fileKey);

  if (!parsedFileKey.success) {
    return { success: false, error: 'Not found' };
  }

  try {
    const photoBelongsToCaller = exists(
      db
        .select({ id: ads.id })
        .from(ads)
        .where(and(eq(ads.id, images.adId), eq(ads.userId, userId)))
    );

    const image = await db.query.images.findFirst({
      where: and(eq(images.fileKey, parsedFileKey.data), photoBelongsToCaller),
      columns: { id: true, fileKey: true },
    });

    if (!image) {
      return { success: false, error: 'Not found' };
    }

    await utapi.deleteFiles(image.fileKey);
    await db.delete(images).where(eq(images.id, image.id));

    return { success: true };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to delete photo');

    return { success: false, error: 'Could not delete the photo' };
  }
}
