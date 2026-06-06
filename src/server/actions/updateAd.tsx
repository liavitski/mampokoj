'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/require-user-id';
import { eq } from 'drizzle-orm';

export async function updateAd(adId: string, formData: FormData) {
  const sessionUserId = await requireUserId();

  if (!sessionUserId) {
    throw new Error('Unauthorized');
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

  redirect(`/dashboard/${sessionUserId}`);
}
