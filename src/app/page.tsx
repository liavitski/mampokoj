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

/**
 * The `region` parameter as a single string, or `undefined`.
 *
 * **A repeated parameter arrives as an array, and the generated
 * `PageProps<'/'>['searchParams']` says so** -- `string | string[] | undefined`,
 * where the hand-written `{ region?: string }` this replaced was wrong about
 * `/?region=PR&region=JM`. The rest of this file's generated types are the same
 * deal: `PageProps<'/'>` and `LayoutProps<'/'>` replace four restatements of what
 * Next already knows from the filesystem, and cannot drift from a renamed
 * directory.
 *
 * An array is *not* a region. Taking the first or last value would be a
 * decision nobody made on purpose, and the page has one honest answer for a
 * `region` it cannot read as a single code: render "No ads found for this
 * region", the same branch a code outside the fourteen takes. That is also what
 * the code did before this type was honest -- `isRegionCode(['PR','JM'])` compared
 * an array against fourteen strings and returned false -- so this makes an
 * accident explicit rather than changing a rendering.
 *
 * The two cases are reported separately by `isUnreadableRegion` rather than
 * collapsed, because they answer differently and only one of them means "no
 * filter": an absent parameter must still show every ad, while a repeated one is
 * a filter that cannot be read.
 *
 * Both helpers take the raw value rather than a pre-narrowed one, so the two
 * questions ("is it a string?" and "is it an unusable one?") cannot be answered
 * inconsistently at the two call sites. `generateMetadata` needs only the first,
 * and gets the answer it had before.
 */
function readRegion(region: string | string[] | undefined): string | undefined {
  return typeof region === 'string' ? region : undefined;
}

/**
 * Whether a `region` was asked for and cannot be read as one value.
 *
 * Distinct from `readRegion` returning `undefined`, which is also what an absent
 * parameter gives. Verified by mutation: making this `return false` fails three
 * of the four cases in `__tests__/home-cursor.test.ts`.
 */
function isUnreadableRegion(region: string | string[] | undefined): boolean {
  return region !== undefined && typeof region !== 'string';
}

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
}: Pick<PageProps<'/'>, 'searchParams'>): Promise<Metadata> {
  const region = readRegion((await searchParams).region);
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

export default async function Home(props: PageProps<'/'>) {
  const searchParams = await props.searchParams;
  const { cursorCreatedAt, cursorId } = searchParams;
  const region = readRegion(searchParams.region);
  // key that changes per region
  const gridKey = `${region ?? 'all'}:${cursorId ?? 'start'}`;

  // await new Promise((resolve) => setTimeout(resolve, 3000));

  if (isUnreadableRegion(searchParams.region) || (region && !isRegionCode(region))) {
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
  /*
   * `cursorCreatedAt`/`cursorId` are handed to the schema as they arrive,
   * array-valued or not. A repeated `?cursorId=a&cursorId=b` is an array, the
   * schema rejects it, and the cursor reads as absent -- which is the correct
   * answer for two cursors, since the pair names one position and there isn't
   * one to name. No narrowing is needed here and none is done: `safeParse`
   * takes `unknown`, and narrowing the input by hand would only move the
   * rejection somewhere it is no longer tested.
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
      </MainColumn>
    </Wrapper>
  );
}
