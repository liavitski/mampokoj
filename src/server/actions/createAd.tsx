'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { redirect } from 'next/navigation';
import { requireUserId } from '@/lib/require-user-id';

export async function createAd(formData: FormData) {
  const sessionUserId = await requireUserId();

  if (!sessionUserId) {
    throw new Error('Unauthorized');
  }

  const title = formData.get('title') as string;
  const price = String(formData.get('price'));
  const city = formData.get('city') as string;
  const region = formData.get('region') as string;
  const availableFrom = new Date(
    formData.get('availableFrom') as string
  );
  const description = formData.get('description') as string;
  const contactPhone = formData.get('contactPhone') as string;

  const [adId] = await db
    .insert(ads)
    .values({
      userId: sessionUserId,
      title,
      price,
      city,
      region,
      availableFrom,
      description,
      contactPhone,
    })
    .returning({ id: ads.id });

  redirect(`/dashboard/${sessionUserId}`);
}
