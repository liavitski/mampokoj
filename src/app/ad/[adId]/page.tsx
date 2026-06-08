import { getValidatedAd } from '@/server/queries/select';
import { notFound } from 'next/navigation';

import AdCardCompact from '@/components/AdCard/AdCardCompact';

type AdPageProps = {
  params: Promise<{ adId: string }>;
};

export default async function AdPage({ params }: AdPageProps) {
  const { adId } = await params;
  const ad = await getValidatedAd(adId);

  if (!ad) {
    notFound(); 
  }

  const { userId, ...adData } = ad;

  return <AdCardCompact ad={adData} />;
}
