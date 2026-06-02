import { getValidatedAd } from '@/server/queries/select';
import Modal from '@/components/Modal';
import AdCard from '@/components/AdCard';

export default async function PhotoModal({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const adId = (await params).adId;

  const ad = await getValidatedAd(adId);

  if (!ad) {
    return (
      <Modal>
        <h3>Ad not found</h3>
      </Modal>
    );
  }

  return (
    <Modal>
      <AdCard ad={ad} />
    </Modal>
  );
}
