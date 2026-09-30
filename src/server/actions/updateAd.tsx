'use server';

import { eq } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { findAdOwnedByCurrentUser } from '@/lib/ads';

export async function updateAd(adId: string, formData: FormData) {
  try {
    const owned = await findAdOwnedByCurrentUser(adId);

    if (!owned) {
      return { success: false, error: 'Not found' };
    }

    await db
      .update(ads)
      .set({
        title: formData.get('title') as string,
        price: String(formData.get('price')),
        city: formData.get('city') as string,
        region: formData.get('region') as string,
        availableFrom: new Date(
          formData.get('availableFrom') as string
        ),
        description: formData.get('description') as string,
        contactPhone: formData.get('contactPhone') as string,
      })
      .where(eq(ads.id, adId));

    return { success: true, userId: owned.userId };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
