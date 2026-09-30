import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/server/db';
import { ads } from '@/server/db/schema';
import { requireUserId } from '@/lib/require-user-id';

const adIdSchema = z.uuid();

/**
 * Resolves an ad, but only when the signed-in user owns it.
 *
 * Ownership is part of the query rather than a comparison performed after the
 * row has been read, so an unauthorized caller never causes the row to load.
 *
 * Returns `null` for "no such ad", "not yours" and "nobody signed in" alike, so
 * the result cannot be used to discover which ad ids exist.
 *
 * The session's user id is returned alongside the ad so callers do not have to
 * resolve the session a second time.
 */
export async function findAdOwnedByCurrentUser(adId: string) {
  const userId = await requireUserId();

  if (!userId) return null;

  const parsedAdId = adIdSchema.safeParse(adId);

  if (!parsedAdId.success) return null;

  const ad = await db.query.ads.findFirst({
    where: and(eq(ads.id, parsedAdId.data), eq(ads.userId, userId)),
    columns: { id: true },
  });

  if (!ad) return null;

  return { ad, userId };
}
