import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from './db';
import { ads, images } from './db/schema';
import { utapi } from './storage';

/**
 * Removes an ad and everything that belongs to it, in the order storage needs.
 *
 * Files first, then the rows that name them. `images.adId` cascades on delete,
 * so the two row deletes could be collapsed into one -- but the `fileKey`s have
 * to be read before any row goes, and doing that read first is what makes it
 * possible. Deleting the rows first and reading afterwards would find nothing
 * and leave real files in a bucket that bills for them (handoff §2.2).
 *
 * The row deletes are kept explicit rather than leaning on the cascade so the
 * bucket and the database cannot drift apart if the constraint is ever dropped.
 *
 * Shared by the owner path (`deleteAdById`) and the moderator path
 * (`deleteAdAsModerator`) so the two cannot drift apart. **The caller has
 * already decided whether the ad may be removed; nothing here re-checks that.**
 * Authorization is not this function's job, and a teardown that checked it
 * would mean the moderator path had to pass a flag saying so.
 */
export async function teardownAd(adId: string): Promise<void> {
  const imagesToDelete = await db.query.images.findMany({
    where: eq(images.adId, adId),
    columns: { fileKey: true },
  });

  if (imagesToDelete.length) {
    await utapi.deleteFiles(imagesToDelete.map((image) => image.fileKey));
  }

  await db.delete(images).where(eq(images.adId, adId));
  await db.delete(ads).where(eq(ads.id, adId));
}
