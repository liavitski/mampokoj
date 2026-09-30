'use server';

import { eq } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { findAdOwnedByCurrentUser } from '@/lib/ads';
import { parseAdFormData } from '@/lib/validation/ad-schema';

export async function updateAd(adId: string, formData: FormData) {
  const owned = await findAdOwnedByCurrentUser(adId);

  if (!owned) {
    return { success: false, error: 'Not found' };
  }

  const parsed = parseAdFormData(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  try {
    await db
      .update(ads)
      .set(parsed.data)
      .where(eq(ads.id, adId));

    return { success: true, userId: owned.userId };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to update ad', adId);

    return { success: false, error: 'Could not update the ad' };
  }
}
