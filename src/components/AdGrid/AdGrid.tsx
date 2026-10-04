'use client';

import * as React from 'react';
import styled from 'styled-components';
import type { AdsApiResponse, PublicAd } from '@/types/db-types';

import { isAdsApiResponse } from '@/lib/ad-dto';
import { useToast } from '../ToastProvider';
import LoadMoreButton from '../LoadMoreButton';
import AdSummaryCard from '../AdSummaryCard';

type AdGridProps = {
  adsData: AdsApiResponse;
  /**
   * The region the page was rendered for, re-applied to the
   * load-more request. Passed down from the page's `searchParams`
   * prop rather than read here with `useSearchParams`, so this
   * component reads no request-time state of its own.
   */
  region?: string;
};

function AdGrid({ adsData, region }: AdGridProps) {
  const { showToast } = useToast();
  const [adsList, setAdsList] = React.useState<PublicAd[]>(
    adsData.items
  );
  const [cursor, setCursor] = React.useState(adsData.nextCursor);
  const [hasMoreState, setHasMoreState] = React.useState(
    adsData.hasMore
  );

  const [loading, setLoading] = React.useState(false);

  // Soved this by passing unique key from parent. Key will trigger re-reder
  // so not needed effect.

  // sync state when server-provided props change (e.g. after router.refresh())
  // React.useEffect(() => {
  //   setAdsList(adsData.items);
  //   setCursor(adsData.nextCursor);
  //   setHasMoreState(adsData.hasMore);
  // }, [adsData.items, adsData.nextCursor, adsData.hasMore]);

  async function loadMore() {
    if (!cursor || loading) return;

    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (region) params.set('region', region);

      params.set('cursorCreatedAt', cursor.cursorCreatedAt);
      params.set('cursorId', cursor.cursorId);

      const res = await fetch(`/api/ads?${params.toString()}`);

      if (!res.ok) {
        showToast('Could not load more ads', 'error');
        return;
      }

      const data: unknown = await res.json();

      if (!isAdsApiResponse(data)) {
        showToast('Could not load more ads', 'error');
        return;
      }

      setAdsList((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMoreState(data.hasMore);
    } catch {
      showToast('Could not load more ads', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Wrapper>
      <CardsWrapper>
        {adsList.map((ad) => (
          <AdSummaryCard key={ad.id} ad={ad} />
        ))}
      </CardsWrapper>


      {hasMoreState && (
        <LoadMoreButton
          nextCursor={cursor}
          loading={loading}
          onLoadMore={loadMore}
        />
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const CardsWrapper = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
`;

export default AdGrid;
