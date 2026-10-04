import * as React from 'react';

import { PAGE_SIZE } from '@/constants';
import { getAds } from '@/server/queries/select';
import { cursorParamsSchema, toAdsCursor } from '@/lib/validation/cursor';

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

  // Same reading of an unreadable cursor as `app/page.tsx` -- no cursor, first
  // page -- and the same schema, so wiring this component up later does not
  // resurrect the 500 that `new Date('not-a-date')` and a non-uuid id caused.
  const parsedCursor = cursorParamsSchema.safeParse({ cursorCreatedAt, cursorId });
  const cursor = parsedCursor.success ? toAdsCursor(parsedCursor.data) : undefined;

  const { items, hasMore, nextCursor } = await getAds(
    PAGE_SIZE,
    region,
    cursor
  );

  return (
    <Wrapper>
      <AdGrid
        key={gridKey}
        region={region}
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
