import 'server-only';

import { db } from '@/server/db';
import { images } from '@/server/db/schema';
import { findAdOwnedByUser } from '@/lib/ads';

export type AddImageToAdProps = {
  adId: string;
  /**
   * The owner `checkUploadAdmission` settled, carried through in metadata.
   *
   * NOT from the client and NOT from the session: `onUploadComplete` runs as a
   * server-to-server callback with no session cookie, so re-deriving the owner
   * here returned null and every upload failed to attach after UploadThing had
   * already stored and billed for the file. See `upload-guard.ts`.
   */
  userId: string;
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
 * The owner is checked against `userId`, which the upload middleware resolved
 * from the session before any bytes were transferred -- not from the arguments,
 * and not from a session read that cannot succeed in a callback.
 */
export async function addImageToAd({
  adId,
  userId,
  url,
  fileKey,
}: AddImageToAdProps): Promise<AddImageResult> {
  const owned = await findAdOwnedByUser(adId, userId);

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
