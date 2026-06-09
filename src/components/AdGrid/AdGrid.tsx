'use client';

import * as React from 'react';
import AdSummaryCard from '../AdSummaryCard';
import styled from 'styled-components';
import type { AdsApiResponse, AdWithImages } from '@/types/db-types';
import LoadMoreButton from '../LoadMoreButton';
import { useSearchParams } from 'next/navigation';

type AdGridProps = {
  adsData: AdsApiResponse;
};

function AdGrid({ adsData }: AdGridProps) {
  const [adsList, setAdsList] = React.useState<AdWithImages[]>(
    () => adsData.items
  );
  const [cursor, setCursor] = React.useState(
    () => adsData.nextCursor
  );
  const [hasMoreState, setHasMoreState] = React.useState(
    () => adsData.hasMore
  );

  const [loading, setLoading] = React.useState(false);
  const searchParams = useSearchParams();
  const region = searchParams.get('region');

  // sync state when server-provided props change (e.g. after router.refresh())
  React.useEffect(() => {
    setAdsList(adsData.items);
    setCursor(adsData.nextCursor);
    setHasMoreState(adsData.hasMore);
  }, [adsData.items, adsData.nextCursor, adsData.hasMore]);

  async function loadMore() {
    if (!cursor || loading) return;

    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (region) params.set('region', region);

      params.set('cursorCreatedAt', cursor.cursorCreatedAt);
      params.set('cursorId', cursor.cursorId);

      const res = await fetch(`/api/ads?${params.toString()}`);

      const data = (await res.json()) as AdsApiResponse;

      setAdsList((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMoreState(data.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Wrapper>
        {adsList.map((ad) => (
          <AdSummaryCard key={ad.id} ad={ad} />
        ))}
      </Wrapper>

      {hasMoreState && (
        <LoadMoreButton
          nextCursor={cursor}
          loading={loading}
          onLoadMore={loadMore}
        />
      )}
    </>
  );
}

const Wrapper = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
`;

export default AdGrid;
