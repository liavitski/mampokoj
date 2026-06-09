'use client';

import * as React from 'react';
import Button from '../Button';
import type { AdsApiCursor } from '@/types/db-types';

type LoadMoreButtonProps = {
  nextCursor: AdsApiCursor | null;
  onLoadMore: (cursor: AdsApiCursor) => void;
  loading: boolean;
};

function LoadMoreButton({
  nextCursor,
  loading,
  onLoadMore,
}: LoadMoreButtonProps) {
  return (
    <Button
      variant="fill"
      size="small"
      disabled={!nextCursor || loading}
      onClick={() => nextCursor && onLoadMore(nextCursor)}
    >
      {loading ? 'Loading...' : 'Load more'}
    </Button>
  );
}
export default LoadMoreButton;
