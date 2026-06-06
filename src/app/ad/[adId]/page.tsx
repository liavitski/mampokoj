import { getValidatedAd } from '@/server/queries/select';
import { notFound } from 'next/navigation';
import AdCard from '@/components/AdCard';

type AdPageProps = {
  params: Promise<{ adId: string }>;
};

export default async function AdPage({ params }: AdPageProps) {
  const { adId } = await params;
  const ad = await getValidatedAd(adId);

  if (!ad) {
    notFound(); // triggers /404 page or not-found.tsx
  }

  return <AdCard ad={ad} />;
}
