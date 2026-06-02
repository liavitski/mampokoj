'use server';
import { db } from './db';
import { ads, images } from './db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export async function createAd(formData: FormData) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) {
    throw new Error('Unauthorized');
  }

  const [ad] = await db
    .insert(ads)
    .values({
      userId: sessionUserId,
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
    .returning({ id: ads.id });
  console.log(ad);
  redirect(`/dashboard/${sessionUserId}`);
}

type addImageToAdProps = {
  adId: string;
  userId: string;
  url: string;
};

export async function addImageToAd({
  adId,
  userId,
  url,
}: addImageToAdProps) {
  // basic input validation
  if (!adId || !userId || !url) {
    throw new Error('adId, userId, and url are required');
  }

  // optional: basic URL validation
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid image URL');
  }

  // ensure ad exists
  const ad = await db.query.ads.findFirst({
    where: (t, { eq }) => eq(t.id, adId),
    columns: { id: true, userId: true },
  });

  if (!ad) {
    throw new Error('Ad not found');
  }

  // ensure user owns the ad (or is allowed to add images)
  if (ad.userId !== userId) {
    throw new Error('Not authorized to add images to this ad');
  }

  const [inserted] = await db
    .insert(images)
    .values({
      adId,
      userId,
      url,
    })
    .returning();

  return inserted;
}
