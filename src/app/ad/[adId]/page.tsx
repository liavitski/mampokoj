import { getValidatedAd } from '@/server/queries/select';
import { notFound } from 'next/navigation';

export default async function AdPage({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const { adId } = await params;
  const ad = await getValidatedAd(adId);

  if (!ad) {
    notFound(); // triggers /404 page or not-found.tsx
  }

  return <h2>{JSON.stringify(ad)}</h2>;
}
