import 'server-only';

import { db } from '@/server/db';
import { images } from '@/server/db/schema';
import { findAdOwnedByCurrentUser } from '@/lib/ads';

export type AddImageToAdProps = {
  adId: string;
  url: string;
  fileKey: string;
};

export type AddImageResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Attaches an uploaded image to one of the caller's own ads.
 *
 * Deliberately NOT a Server Action. This used to carry 'use server', which
 * made it reachable by direct POST: a caller could then insert image rows
 * with an arbitrary `url`, bypassing both the photo limit and the rate limit
 * that the upload middleware enforces, and a forged row becomes the cover
 * image of the public listing. Only `onUploadComplete` needs this, and it
 * calls it directly, so there is no reason to publish an RPC endpoint.
 *
 * The owner is resolved from the session, never from the arguments.
 */
export async function addImageToAd({
  adId,
  url,
  fileKey,
}: AddImageToAdProps): Promise<AddImageResult> {
  const owned = await findAdOwnedByCurrentUser(adId);

  if (!owned) {
    return { success: false, error: 'Not found' };
  }

  try {
    await db.insert(images).values({ adId, url, fileKey });

    return { success: true };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to attach image to ad', adId);

    return { success: false, error: 'Could not save the image' };
  }
}
