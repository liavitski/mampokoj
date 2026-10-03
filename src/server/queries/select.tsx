import 'server-only';

import { db } from '../db';
import { eq, count, isNotNull } from 'drizzle-orm';
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

export const getAds = async (
  limit = PAGE_SIZE,
  region?: string,
  cursor?: AdsCursor
) => {
  const adsPage = await db.query.ads.findMany({
    where: (ads, { and, eq, lt, or }) => {
      const base = region ? eq(ads.region, region) : undefined;

      const pagination = cursor
        ? or(
            lt(ads.createdAt, cursor.createdAt),
            and(
              eq(ads.createdAt, cursor.createdAt),
              lt(ads.id, cursor.id)
            )
          )
        : undefined;

      return and(base, pagination);
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

  const hasMore = adsPage.length > limit;
  const items = hasMore ? adsPage.slice(0, limit) : adsPage;

  if (items.length === 0) {
    return {
      items: [],
      hasMore: false,
      nextCursor: null as AdsCursor | null,
    };
  }

  const last = items[items.length - 1]!;

  return {
    items,
    hasMore,
    nextCursor: hasMore
      ? {
          createdAt: last.createdAt,
          id: last.id,
        }
      : null,
  };
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
