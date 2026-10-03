import { isRegionCode } from '@/utils/utils';
import { PAGE_SIZE } from '@/constants';
import { getAds } from '@/server/queries/select';
import { homeMeta } from '@/lib/seo';
import { cursorParamsSchema, toAdsCursor } from '@/lib/validation/cursor';

import type { Metadata } from 'next';

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

/**
 * Metadata for the grid, including the region it is filtered to.
 *
 * **The cursor parameters are dropped from the canonical URL, and that is the
 * point of this function.** `cursorCreatedAt`/`cursorId` are the infinite
 * scroll's position, not a different view: `/?region=PR&cursorCreatedAt=...`
 * renders the *second page* of the same Prague listing. Self-referencing
 * canonicals there would tell a crawler that all 20 pages of a region are
 * distinct documents competing with each other, and the region page would be
 * whichever page the crawler happened to reach. Pointing every one of them at
 * `/?region=PR` states the actual relationship.
 *
 * An invalid `region` canonicalises to `/` rather than to itself, because the
 * page renders "No ads found for this region" -- there is nothing there to
 * index, and a canonical pointing at an empty result invites the URL itself to
 * be indexed as a thin page.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { region } = await searchParams;
  const validRegion = region && isRegionCode(region) ? region : undefined;

  const { title, description } = homeMeta(validRegion);

  return {
    title,
    description,
    alternates: {
      canonical: validRegion ? `/?region=${validRegion}` : '/',
    },
    openGraph: {
      title,
      description,
      url: validRegion ? `/?region=${validRegion}` : '/',
    },
  };
}

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

  /**
   * An unreadable cursor reads as no cursor, so the page renders its first
   * page rather than throwing.
   *
   * Both halves arrive from the URL and are untrusted: without this the raw
   * strings went into the query, where Postgres rejected a non-uuid with
   * `invalid input syntax for type uuid` and a non-date with `RangeError:
   * Invalid time value`, and `/?cursorId=not-a-uuid` was an unhandled 500
   * instead of a page. A Next page cannot answer 400 -- the statuses available
   * here are 200 and `notFound()`'s 404 -- and a 404 would be a lie about a URL
   * that is perfectly valid apart from two junk parameters.
   *
   * Falling back to the first page is the honest reading: the cursor is a
   * position in a list, not a filter, and an unreadable position is the start.
   * Only the app writes these parameters (`AdGrid` appends them from
   * `nextCursor`), so this path is a crawler or a hand-edited URL, not a
   * visitor being stranded mid-list. Same shape as the unknown-region branch
   * above, which likewise renders rather than erroring.
   */
  const parsedCursor = cursorParamsSchema.safeParse({ cursorCreatedAt, cursorId });
  const cursor = parsedCursor.success ? toAdsCursor(parsedCursor.data) : undefined;

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
