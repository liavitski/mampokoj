import * as React from 'react';

import { PAGE_SIZE } from '@/constants';
import { getAds } from '@/server/queries/select';

import AdGrid from '../AdGrid';
import { Wrapper } from './MainColumn.styles';

type MainColumnProps = {
  region?: string;
  cursorCreatedAt?: string;
  cursorId?: string;
};

// exprimenting with suspence
async function MainColumn({
  region,
  cursorCreatedAt,
  cursorId,
}: MainColumnProps) {
  const gridKey = `${region ?? 'all'}:${cursorId ?? 'start'}`;

  const cursor =
    cursorCreatedAt && cursorId
      ? {
          createdAt: new Date(cursorCreatedAt),
          id: cursorId,
        }
      : undefined;

  const { items, hasMore, nextCursor } = await getAds(
    PAGE_SIZE,
    region,
    cursor
  );

  return (
    <Wrapper>
      <AdGrid
        key={gridKey}
        adsData={{
          items,
          hasMore,
          nextCursor: nextCursor
            ? {
                cursorCreatedAt: nextCursor.createdAt.toISOString(),
                cursorId: nextCursor.id,
              }
            : null,
        }}
      />
    </Wrapper>
  );
}

export default MainColumn;
