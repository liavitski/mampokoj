import { getValidatedAd } from '@/server/queries/select';
import AdModal from './modal';
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
      <AdModal>
        <h3>Ad not found</h3>
      </AdModal>
    );
  }

  return (
    <AdModal>
      <AdCard ad={ad} />
    </AdModal>
  );
}
