import { getValidatedAd } from '@/server/queries/select';
import { notFound } from 'next/navigation';
import AdCardCompact from '@/components/AdCard/AdCardCompact';

// Async boundary
async function AdLoader({ adId }: { adId: string }) {
  const ad = await getValidatedAd(adId);

  if (!ad) notFound();

  const { userId, ...adData } = ad;

  return <AdCardCompact ad={adData} />;
}

export default AdLoader;
