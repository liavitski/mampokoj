'use server';

import { and, eq, isNull, ne } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { adIdSchema } from '@/lib/validation/ad-schema';

export type ReportAdResult = { success: true } | { success: false; error: string };

/**
 * Flags a listing as reported by a signed-in visitor.
 *
 * One statement decides everything, and the decision is in its predicate rather
 * than in a read first: the update matches only a row whose `reportedAt` is
 * still null, so the first report wins and every later one updates no rows.
 * That is what makes a repeat click, and two visitors racing, safe without a
 * transaction -- which `db.transaction` cannot provide on the neon-http driver
 * (handoff.md §3) -- and without Redis, which cannot be reached from this
 * machine at all (§1). The reasoning is the slot index's (§7): let the write
 * conflict instead of asking first.
 *
 * The poster is excluded in the same predicate. A self-report is queue noise,
 * and since reported ads are never hidden from the public grid it would also be
 * a way for a poster to mark their own ad for attention and nothing else.
 *
 * So is an ad a moderator has already reviewed. `checkedAt IS NULL` sits beside
 * `reportedAt IS NULL` for the same reason and with the same guarantee: a
 * checked ad is not reportable, and because the refusal happens in the write
 * there is no window in which a report could land between a moderator's decision
 * and the next one.
 *
 * Four refusals -- already reported, checked, own ad, no such ad -- return one
 * undifferentiated message. `src/lib/ads.ts` refuses to distinguish "no such
 * ad" from "not yours" so a caller cannot enumerate ids, and that reasoning is
 * deliberately not copied here: existence is already observable, since
 * `getValidatedAd` returns null and the detail route calls `notFound()`. There
 * is no existence secret left to protect, and "already reported" would be a lie
 * for the self-report case, so one honest string serves all three.
 */
export async function reportAd(adId: string): Promise<ReportAdResult> {
  const userId = await requireUserId();

  if (!userId) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = adIdSchema.safeParse(adId);

  if (!parsed.success) {
    return { success: false, error: 'Not found' };
  }

  try {
    const reported = await db
      .update(ads)
      // Set explicitly rather than left to a $defaultFn: this action is the
      // only writer of the column.
      //
      // Note that drizzle applies `updatedAt`'s $onUpdate to every update, so
      // reporting an ad also moves that column. Kept rather than worked around
      // with raw SQL, which would cost the compiled-SQL assertions this
      // predicate is tested with; see the column's comment in db/schema.ts.
      .set({ reportedAt: new Date() })
      .where(
        and(
          eq(ads.id, parsed.data),
          // First report wins: matches nothing once the column is set.
          isNull(ads.reportedAt),
          // And an ad a moderator has reviewed is not reportable at all. This is
          // the "solid" promise the moderation page makes, and it is enforced by
          // the write matching nothing rather than by a read that could be
          // raced: no visitor, however many of them, can put a checked ad back in
          // the queue. Same first-writer-wins shape as the line above.
          isNull(ads.checkedAt),
          // The session id wins over anything a caller supplied. It is never
          // read from an argument, which is what would make the guard above
          // bypassable by naming somebody else's id.
          ne(ads.userId, userId)
        )
      )
      .returning({ id: ads.id });

    if (reported.length === 0) {
      return { success: false, error: 'Could not report this ad' };
    }

    return { success: true };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to report ad', adId);

    return { success: false, error: 'Could not report this ad' };
  }
}
