'use server';

import { db } from '@/server/db';
import { images } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/require-user-id';
import { utapi } from '@/app/api/uploadthing/core';
import { redirect } from 'next/navigation';

export async function deletePhotoByFileKey(fileKey: string) {
  try {
    const sessionUserId = await requireUserId();

    const image = await db.query.images.findFirst({
      where: (t, { eq }) => eq(t.fileKey, fileKey),
      columns: {
        id: true,
        fileKey: true,
      },
      with: {
        ad: {
          columns: {
            userId: true,
          },
        },
      },
    });

    if (!image) {
      return { success: false, error: 'Photo not found' };
    }

    if (image.ad.userId !== sessionUserId) {
      return { success: false, error: 'Forbidden' };
    }

    await utapi.deleteFiles(fileKey);

    await db.delete(images).where(eq(images.fileKey, fileKey));

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
