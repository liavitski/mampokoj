'use server';

import { count, eq } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { parseAdFormData } from '@/lib/validation/ad-schema';
import { MAX_ADS_PER_USER } from '@/constants';

async function countUserAds(userId: string) {
  const [row] = await db
    .select({ value: count(ads.id) })
    .from(ads)
    .where(eq(ads.userId, userId));

  return row?.value ?? 0;
}

export async function createAd(formData: FormData) {
  const userId = await requireUserId();

  if (!userId) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = parseAdFormData(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  const existing = await countUserAds(userId);

  if (existing >= MAX_ADS_PER_USER) {
    return {
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    };
  }

  try {
    const [ad] = await db
      .insert(ads)
      // userId last: the session id must win over anything that came out of
      // the submitted form.
      .values({ ...parsed.data, userId })
      .returning({ id: ads.id });

    return { success: true, adId: ad.id, userId };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to create ad');

    return { success: false, error: 'Could not create the ad' };
  }
}
