import 'server-only';

import { db } from '../db';
import { eq, count, isNotNull, and, or, lt } from 'drizzle-orm';
import { ads, images } from '../db/schema';
import { PAGE_SIZE, MAX_ADS_PER_USER } from '@/constants';
import { adIdSchema } from '@/lib/validation/ad-schema';
import type { AdsCursor } from '@/types/db-types';

/**
 * Columns safe to send to any client.
 *
 * `userId` is the poster's OAuth account id and `contactPhone` is personal
 * contact data. Neither belongs in a list of ads, so they are excluded at the
 * query rather than stripped on the way out -- the columns are never loaded.
 * `getValidatedAd` is the separate, deliberate path for a single ad's details.
 */
const publicAdColumns = {
  id: true,
  title: true,
  price: true,
  city: true,
  region: true,
  availableFrom: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The pagination predicate: rows strictly older than the cursor, under the same
 * `(createdAt, id)` descending order both lists use.
 *
 * One definition for both `getAds` and `getAllAds`. They order identically and
 * page identically, and a second copy of this clause is a copy that can gain a
 * `lt` where the other has an `eq` -- at which point one list skips rows or
 * repeats them and nothing reports it.
 *
 * The `id` tiebreak is the reason this is not `createdAt < cursor.createdAt`:
 * `createdAt` is not unique, and dropping the tiebreak silently drops every ad
 * posted in the same millisecond as the cursor's row.
 */
const olderThan = (cursor: AdsCursor) =>
  or(
    lt(ads.createdAt, cursor.createdAt),
    and(eq(ads.createdAt, cursor.createdAt), lt(ads.id, cursor.id))
  );

/**
 * Turns a `limit + 1` read into a page, and reads the extra row as the answer
 * to "is there another page".
 *
 * Shared rather than restated per query, because the arithmetic and the
 * `nextCursor` it produces are the contract both paginated surfaces depend on,
 * and an off-by-one in one of them shows up as a duplicate row at a page
 * boundary rather than as an error.
 */
function toPage<TRow extends { id: string; createdAt: Date }>(
  rows: TRow[],
  limit: number
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export const getAds = async (
  limit = PAGE_SIZE,
  region?: string,
  cursor?: AdsCursor
) => {
  const adsPage = await db.query.ads.findMany({
    where: (ads, { and }) => {
      const base = region ? eq(ads.region, region) : undefined;

      return and(base, cursor ? olderThan(cursor) : undefined);
    },

    columns: publicAdColumns,

    limit: limit + 1,

    orderBy: (ads, { desc }) => [desc(ads.createdAt), desc(ads.id)],

    with: {
      images: {
        limit: 1,
        orderBy: (img, { desc }) => [desc(img.createdAt)],
      },
    },
  });

  return toPage(adsPage, limit);
};

/**
 * Columns for the public detail view of one ad.
 *
 * This view reaches every visitor, including the intercepting modal, so it is
 * an allowlist like `publicAdColumns` rather than the whole row. The one column
 * missing from the row that is deliberately so: `reportedAt` is moderation
 * state, and leaving it out here is what keeps it out of the RSC payload
 * rather than merely out of the prop type.
 *
 * `getValidatedAd` selects the whole row for the poster's own fields --
 * `contactPhone` and `userId` are both needed here -- which is why the omission
 * has to be explicit rather than a consequence of the DTO.
 */
const detailAdColumns = {
  id: true,
  userId: true,
  slot: true,
  title: true,
  price: true,
  city: true,
  region: true,
  availableFrom: true,
  description: true,
  contactPhone: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Loads a single ad with its photos.
 *
 * Returns `null` when there is no such ad, rather than throwing. Both callers
 * turn a null into `notFound()`, so throwing here replaced a 404 page with an
 * error page every time somebody followed a link to a deleted ad.
 */
export async function getValidatedAd(adId: string) {
  const parsed = adIdSchema.safeParse(adId);

  if (!parsed.success) return null;

  const adWithImages = await db.query.ads.findFirst({
    where: eq(ads.id, parsed.data),
    columns: detailAdColumns,
    with: {
      images: {
        // This view is shown to visitors, who cannot delete photos, so the
        // storage key is not selected. Only the owner's dashboard needs it,
        // because only there can a photo be deleted.
        columns: { id: true, url: true, createdAt: true },
      },
    },
  });

  return adWithImages ?? null;
}

// Dashboard page
export async function getUserAds(userId: string) {
  const userAds = await db.query.ads.findMany({
    where: eq(ads.userId, userId),
    with: {
      images: true,
    },
    orderBy: (ads, { desc }) => [desc(ads.createdAt)],
    // Bounded on principle. MAX_ADS_PER_USER caps new ads, but the limit is
    // not the only thing that writes to this table, and an unbounded read
    // grows with whatever is in it.
    limit: MAX_ADS_PER_USER * 10,
  });

  return userAds;
}

/**
 * Columns for the sitemap.
 *
 * The narrowest list in this file, and the only one that exists to answer "does
 * this URL exist and when did it last change" -- which is all a sitemap entry
 * can carry. Deliberately *not* `publicAdColumns` with fields left unused: that
 * would read `description`, `price` and `city` for every ad in the sitemap, and
 * join the newest photo per row, to throw all of it away. At the 100 rows
 * `SITEMAP_AD_LIMIT` asks for, that is a real query plan for no output.
 *
 * `id` and `updatedAt` only. No `userId`, no `contactPhone`, no moderation
 * state: none of it reaches a sitemap, and a column that cannot influence the
 * output is a column that should not be read.
 */
const sitemapAdColumns = {
  id: true,
  updatedAt: true,
} as const;

/**
 * The newest ads, for `sitemap.xml`.
 *
 * Bounded on principle, like every other list here, and by the caller rather
 * than by a default -- the bound is a crawler-budget decision (`SITEMAP_AD_LIMIT`
 * explains it), not a property of the query.
 *
 * No region predicate: a sitemap wants every indexable URL, and the region
 * pages in it are the 14 `/?region=` URLs, not a filtered subset of the ads.
 * Filtering by region here would produce a sitemap whose ad entries all point
 * at the same home page, which is not a sitemap.
 *
 * `createdAt, id` descending for the same reason `getAllAds` orders that way:
 * it is the index that serves it, and `createdAt` alone is not a total order.
 */
export async function getIndexableAds(limit: number) {
  return db.query.ads.findMany({
    columns: sitemapAdColumns,
    orderBy: (ads, { desc }) => [desc(ads.createdAt), desc(ads.id)],
    limit,
  });
}

/**
 * Columns for the moderation queue.
 *
 * An allowlist, like `publicAdColumns`, but the opposite question. A moderator
 * is deciding whether to remove a listing, and the basis of that decision is
 * the contact number -- a scam is recognised by the number -- plus whose ad it
 * is. So `contactPhone` and `userId` are *required* here, where both are
 * withheld everywhere else. Reusing `publicAdColumns` would have produced a
 * queue nobody can act on.
 *
 * `slot` is absent: the ad-limit machinery has no bearing on moderation.
 *
 * Shared by both moderator lists. A moderator deciding to delete an ad nobody
 * reported needs the number and the poster exactly as much as one triaging a
 * report, and a second narrower copy of these columns is how one of them would
 * quietly go missing.
 *
 * `checkedAt` is here because the all-ads list is where a moderator sets and
 * unsets the check, and a row that cannot say whether it is checked cannot offer
 * the right button. It stays out of `publicAdColumns` and `detailAdColumns` for
 * the same reason `reportedAt` does: publishing it would hand every visitor the
 * list of ads nobody is allowed to report.
 */
const moderatorAdColumns = {
  id: true,
  userId: true,
  title: true,
  price: true,
  city: true,
  region: true,
  contactPhone: true,
  description: true,
  createdAt: true,
  reportedAt: true,
  checkedAt: true,
} as const;

/**
 * The moderation queue: every ad somebody has reported, newest report first.
 *
 * Backed by the partial index `mampokoj_ads_reported_idx`, which covers exactly
 * this predicate -- and whose backward scan serves the `ORDER BY reportedAt DESC`
 * for free, which is why ordering by `reportedAt` rather than `createdAt`.
 *
 * Bounded on principle, for the reason `getUserAds` gives: MAX_ADS_PER_USER
 * caps what can be posted, but it is not the only thing that writes here, and an
 * unbounded read grows with whatever is in it.
 *
 * No `with: { images }`. Whether to take an ad down is a decision about its
 * text and its number; a lateral join per row to fetch photo urls would be
 * wasted work. The photos are removed by `teardownAd` if the answer is yes.
 */
export async function getReportedAds(limit = PAGE_SIZE) {
  const rows = await db.query.ads.findMany({
    where: isNotNull(ads.reportedAt),
    columns: moderatorAdColumns,
    orderBy: (ads, { desc }) => [desc(ads.reportedAt)],
    limit,
  });

  /**
   * Narrowed once, here, because the column is nullable in the schema and the
   * `isNotNull` above is not something TypeScript can see. A type predicate
   * rather than an assertion: on the day the predicate and this filter
   * disagree, the query returns fewer rows instead of handing a caller a `null`
   * it would format as a date.
   */
  return rows.filter(
    (row): row is typeof row & { reportedAt: Date } => row.reportedAt !== null
  );
}

/**
 * `moderatorAdColumns` minus `reportedAt`.
 *
 * Derived by subtraction rather than re-listed, so the two lists cannot drift,
 * and minus rather than "a copy I remembered to trim", so the omission is
 * visible where the columns are defined instead of being a silent difference
 * someone has to notice to find.
 *
 * The reason to trim it: this list is not filtered by reports, so a `reportedAt`
 * in the payload buys the page nothing it may act on -- and an ad that is both
 * reported and listed here already appears in the queue above. Carrying it would
 * only invite a per-row branch in the page, which `moderation-gate.test.ts`
 * forbids because the rows would already have been read by the time it ran.
 */
const allAdsColumns = { ...moderatorAdColumns, reportedAt: false } as const;

/**
 * Every ad on the site, newest first -- the list a moderator deletes from when
 * nobody has reported anything.
 *
 * Reporting is a safety net, not a prerequisite for moderation: a moderator who
 * can already see an obvious scam should be able to remove it without waiting for
 * a visitor to file a report, and `deleteAdAsModerator` has always been able to
 * delete any ad. This query is what makes that reachable from the UI. It was not
 * written before because nothing needed it, and `deleteAdAsModerator` deleting
 * more than its name said was the honest description of the state until now.
 *
 * **No predicate without a cursor, deliberately.** `reportedAt` is absent from
 * the columns too, so there is nothing here that could tempt the page into a
 * per-row check -- which would mean the rows were fetched before the decision,
 * the thing `moderation-gate.test.ts` forbids. The one piece of state this list
 * does branch on is `checkedAt`, and it branches only to pick which button to
 * render. A cursor *is* a predicate, so with one this reads as a filtered
 * subset; that is the pager working, and it is asserted in
 * `select.allAds.test.ts` rather than left to be rediscovered as a bug.
 *
 * Backed by `mampokoj_ads_created_id_idx`, which covers `(createdAt, id)`
 * descending -- the same index and the same ordering `getAds` uses. `id` is in
 * the order because `createdAt` is not unique: without it, two ads posted in the
 * same millisecond come back in an arbitrary order that can differ between two
 * identical queries, and a list that reshuffles under the moderator cannot be
 * paged through or reasoned about.
 *
 * Bounded on principle, and this one matters more than the queue's. The queue is
 * small because reporting is rare; this list covers every ad ever posted, so an
 * unbounded read would grow with the whole table. The bound is a *page*, paged
 * through with `cursor` -- keyset rather than an offset, because a moderator
 * deletes ads off this very list: with `OFFSET`, every row below a deleted one
 * shifts up and "page 3" quietly skips an ad nobody has looked at yet. A
 * keyset cursor names a position rather than a distance, so a deletion above it
 * cannot change what it returns.
 *
 * The shape is `getAds`'s, deliberately -- one `{ items, hasMore, nextCursor }`
 * contract for both paginated surfaces, so the page reads the same either way.
 *
 * No `with: { images }`, for the reason `getReportedAds` gives.
 */
export async function getAllAds(limit = PAGE_SIZE, cursor?: AdsCursor) {
  const rows = await db.query.ads.findMany({
    where: cursor ? olderThan(cursor) : undefined,
    columns: allAdsColumns,
    orderBy: (ads, { desc }) => [desc(ads.createdAt), desc(ads.id)],
    limit: limit + 1,
  });

  return toPage(rows, limit);
}

// Uploadthing core
export async function imageLimit(adId: string, limit = 3) {
  const result = await db
    .select({ value: count(images.id) })
    .from(images)
    .where(eq(images.adId, adId));

  const imageCount = result[0]?.value ?? 0;

  return {
    success: imageCount < limit,
    count: imageCount,
    limit,
  };
}
