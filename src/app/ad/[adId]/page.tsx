import { getValidatedAd } from '@/server/queries/select';
import { notFound } from 'next/navigation';
import AdCard from '@/components/AdCard';

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

  return <AdCard ad={ad} />;
}
