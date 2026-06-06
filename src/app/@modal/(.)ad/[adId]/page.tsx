import { getValidatedAd } from '@/server/queries/select';
import { RouteModal } from './modal-wrapper';

import AdCard from '@/components/AdCard';

type ModalProps = {
  params: Promise<{ adId: string }>;
};

export default async function Modal({ params }: ModalProps) {
  const { adId } = await params;

  const ad = await getValidatedAd(adId);

  if (!ad) {
    return;
  }

  return (
    <RouteModal>
      <AdCard ad={ad} />
    </RouteModal>
  );
}
