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

  // userId is dropped rather than passed down: the compact card has no use for
  // the poster's account id.
  const { userId: _userId, ...adData } = ad;

  return <AdCardCompact ad={adData} />;
}
