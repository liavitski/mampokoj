import { isRegionCode } from '@/utils/utils';
import { PAGE_SIZE } from '@/constants';
import { getAds } from '@/server/queries/select';

import RegionNavigation from '@/components/RegionNavigation';
import AdGrid from '@/components/AdGrid';
import RegionSelectBlock from '@/components/RegionSelectBlock';
import {
  Wrapper,
  MainColumn,
  LeftColumn,
  NoAdsText,
} from './page.styles';

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

