'use server';

import { db } from '../db';
import { images } from '../db/schema';
import { findAdOwnedByCurrentUser } from '@/lib/ads';

export type AddImageToAdProps = {
  adId: string;
  url: string;
  fileKey: string;
};

/**
 * Attaches an uploaded image to one of the caller's own ads.
 *
 * The owner is resolved from the session, never from the arguments: Server
 * Actions are reachable by direct POST, so a `userId` parameter would simply
 * be attacker-controlled input.
 */
export async function addImageToAd({
  adId,
  url,
  fileKey,
}: AddImageToAdProps) {
  try {
    const owned = await findAdOwnedByCurrentUser(adId);

    if (!owned) {
      return { success: false, error: 'Not found' };
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
