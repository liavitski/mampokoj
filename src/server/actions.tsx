'use server';
import { db } from './db';
import { ads } from './db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

// type UploadImageProps = {
//   url: string;
// };

// export async function uploadImage({ url }: UploadImageProps) {
//   if (!url.startsWith('https://gtiivfj57h.ufs.sh/')) {
//     throw new Error('Invalid file source');
//   }

//   try {
//     await db.insert(testimg).values({ url });
//   } catch (e) {
//     console.error('DB insert failed:', e);
//     throw e;
//   }
// }

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
