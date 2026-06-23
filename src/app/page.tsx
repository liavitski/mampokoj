import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';
import { isRegionCode } from '@/utils/utils';
import { PAGE_SIZE } from '@/constants';
import { getAds } from '@/server/queries/select';

import RegionNavigation from '@/components/RegionNavigation';
import AdGrid from '@/components/AdGrid';
import RegionSelectBlock from '@/components/RegionSelectBlock';

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
  // key that changes per region
  const gridKey = `${region ?? 'all'}:${cursorId ?? 'start'}`;

  // await new Promise((resolve) => setTimeout(resolve, 3000));

  if (region && !isRegionCode(region)) {
    return (
      <Wrapper>
        <LeftColumn>
          <RegionNavigation />
        </LeftColumn>
        
        <MainColumn>
          <NoAdsText>No ads found for this region</NoAdsText>
        </MainColumn>

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
      <RegionSelectBlock currentRegion={region} />

      <LeftColumn>
        <RegionNavigation currentRegion={region} />
      </LeftColumn>
      
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
    </Wrapper>
  );
}

const Wrapper = styled.main`
  display: flex;
  gap: 16px;

  @media ${QUERIES.tabletAndSmaller} {
    flex-direction: column;
  }
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

const NoAdsText = styled.p`
  font-weight: ${WEIGHTS.medium};
  font-size: 1rem;
  text-align: center;
`;
