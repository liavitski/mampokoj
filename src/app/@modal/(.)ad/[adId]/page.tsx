import { getValidatedAd } from '@/server/queries/select';
import AdModal from './modal';
import AdSummaryCard from '@/components/AdSummaryCard';

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
      <AdSummaryCard ad={ad} />
    </AdModal>
  );
}
