import * as React from 'react';

import styled from 'styled-components';
import { PAGE_SIZE } from '@/constants';
import AdGrid from '../AdGrid';
import { getAds } from '@/server/queries/select';

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

const Wrapper = styled.div`
  flex: 1;
`;

export default MainColumn;
