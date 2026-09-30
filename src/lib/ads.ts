import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { ads } from '@/server/db/schema';
import { requireUserId } from '@/lib/session';
import { adIdSchema } from '@/lib/validation/ad-schema';

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

  return findAdOwnedByUser(adId, userId);
}

/**
 * The same ownership check, against an explicitly supplied user id.
 *
 * This exists for `onUploadComplete`, which cannot use the session. UploadThing
 * invokes that callback server-to-server after the browser has finished
 * uploading, so the request carries no session cookie and `requireUserId()`
 * returns null -- which made every real upload silently fail to attach. The
 * middleware already resolved the owner in the user's own request and hands the
 * id on in metadata, so the check survives without the cookie.
 *
 * The caller is responsible for where `userId` came from. Passing one that was
 * not settled by the middleware turns this into a lookup of "does this ad belong
 * to whoever claims it", which is nothing.
 */
export async function findAdOwnedByUser(adId: string, userId: string) {
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
