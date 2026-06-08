import { getValidatedAd } from '@/server/queries/select';
import { RouteModal } from './modal-wrapper';
import { notFound } from 'next/navigation';

import AdCardCompact from '@/components/AdCard/AdCardCompact';


type ModalProps = {
  params: Promise<{ adId: string }>;
};

export default async function Modal({ params }: ModalProps) {
  const { adId } = await params;

  const ad = await getValidatedAd(adId);

  if (!ad) notFound();

  const { userId, ...adData } = ad;

  return (
    <RouteModal>
      <AdCardCompact ad={adData} />
    </RouteModal>
  );
}
