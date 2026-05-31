'use server';
import { db } from './db';
import { testimg } from './db/schema';

type UploadImageProps = {
  url: string;
};

export async function uploadImage({ url }: UploadImageProps) {
  if (!url.startsWith('https://gtiivfj57h.ufs.sh/')) {
    throw new Error('Invalid file source');
  }

  try {
    await db.insert(testimg).values({ url });
  } catch (e) {
    console.error('DB insert failed:', e);
    throw e;
  }
}
