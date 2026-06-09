import styled from 'styled-components';
import RegionNavigation from '@/components/RegionNavigation';
import AdGrid from '@/components/AdGrid';
import { QUERIES } from '@/constants';
import { isRegionCode } from '@/utils/utils';
import { PAGE_SIZE } from '@/constants';
import { getAds } from '@/server/queries/select';

export const dynamic = 'force-dynamic';

type SearchParams = {
  region?: string;
  cursorCreatedAt?: string;
  cursorId?: string;
};

type HomeProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { region, cursorCreatedAt, cursorId } = await searchParams;
  // key that changes per region (or include nextCursor id)
  const gridKey = `${region ?? 'all'}:${cursorId ?? 'start'}`;

  if (region && !isRegionCode(region)) {
    return (
      <Wrapper>
        <MainColumn>
          <h3>No ads found for this region</h3>
        </MainColumn>

        <LeftColumn>
          <RegionNavigation />
        </LeftColumn>
      </Wrapper>
    );
  }

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
      <MainColumn>
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
      </MainColumn>

      <LeftColumn>
        <RegionNavigation currentRegion={region} />
      </LeftColumn>
    </Wrapper>
  );
}

const Wrapper = styled.main`
  display: flex;
  flex-direction: row-reverse;
`;

const MainColumn = styled.div`
  flex: 1;
`;

const LeftColumn = styled.aside`
  flex-basis: 248px;

  @media ${QUERIES.tabletAndSmaller} {
    display: none;
  }
`;
