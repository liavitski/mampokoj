import { getValidatedAd } from '@/server/queries/select';
import { RouteModal } from './modal-wrapper';
import AdCard from '@/components/AdCard';

export default async function PhotoModal({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const adId = (await params).adId;

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
