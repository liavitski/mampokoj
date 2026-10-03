'use server';

import { findAdOwnedByCurrentUser } from '@/lib/ads';
import { teardownAd } from '@/server/ad-teardown';

/**
 * The owner removes their own ad.
 *
 * The ownership check is the only thing standing between a session and a
 * deletion, so it is deliberately left as the first statement and is not shared
 * with the moderator path -- see `deleteAdAsModerator` for why the bypass lives
 * in a separate action rather than behind a flag here.
 */
export async function deleteAdById(adId: string) {
  const owned = await findAdOwnedByCurrentUser(adId);

  if (!owned) {
    return { success: false, error: 'Not found' };
  }

  try {
    await teardownAd(adId);

    return { success: true, userId: owned.userId };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to delete ad', adId);

    return { success: false, error: 'Could not delete the ad' };
  }
}
