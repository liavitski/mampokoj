import { getValidatedAd } from '@/server/queries/select';
import { notFound } from 'next/navigation';
import styled from 'styled-components';
import AdSummaryCard from '@/components/AdSummaryCard';

export default async function AdPage({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const { adId } = await params;
  const ad = await getValidatedAd(adId);

  if (!ad) {
    notFound(); // triggers /404 page or not-found.tsx
  }

  return (
    <AdCardWrapper>
      <AdSummaryCard ad={ad} />
    </AdCardWrapper>
  );
}

const AdCardWrapper = styled.div`
  max-width: 500px;
`;
