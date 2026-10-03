'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { parseAdFormData, type AdInput } from '@/lib/validation/ad-schema';
import { LockBusyError, withUserLock } from '@/server/user-lock';
import { MAX_ADS_PER_USER } from '@/constants';

/**
 * `success` is a literal discriminant, not a widened boolean: the create form
 * reads `res.userId` inside `if (res.success)`, which only narrows if the two
 * shapes stay distinguishable.
 */
export type CreateAdResult =
  | { success: true; adId: string; userId: string }
  | { success: false; error: string };

/**
 * Inserts into the first ad slot the user does not hold.
 *
 * MAX_ADS_PER_USER is enforced by the unique index on (userId, slot): an
 * insert only succeeds into a slot nobody holds, and a user at the limit
 * holds every one. Postgres is the referee, so the limit holds when Redis
 * is unreachable -- no count is read first, so none can go stale under a
 * concurrent create.
 *
 * A conflict is read off `error.cause.code`: drizzle wraps the driver
 * error, so the 23505 arrives one level down (handoff.md §4). The ads
 * table's only other unique constraint is the random primary key, which
 * cannot collide in practice, so a 23505 on this insert means this slot
 * is taken -- by an earlier ad of this user or by a concurrent create --
 * and the next slot is tried. Any other failure is rethrown rather than
 * retried, so a real error is not mistaken for a full account.
 */
async function insertIntoFreeSlot(
  userId: string,
  input: AdInput
): Promise<CreateAdResult> {
  for (let slot = 0; slot < MAX_ADS_PER_USER; slot += 1) {
    try {
      const [created] = await db
        .insert(ads)
        // userId last: the session id must win over anything that came out of
        // the submitted form.
        .values({ ...input, userId, slot })
        .returning({ id: ads.id });

      return { success: true, adId: created.id, userId };
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;

      if (code !== '23505') throw error;
    }
  }

  return {
    success: false,
    error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
  };
}

export async function createAd(
  formData: FormData
): Promise<CreateAdResult> {
  const userId = await requireUserId();

  if (!userId) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = parseAdFormData(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  try {
    return await withUserLock(
      userId,
      () => insertIntoFreeSlot(userId, parsed.data),
      // Named rather than defaulted, so that this and any future create path
      // either share one lock deliberately or are seen to differ.
      'create-ad'
    );
  } catch (error) {
    // Validation failures may explain themselves; this one is a retry, and it
    // deliberately does not say "someone else is creating an ad right now".
    if (error instanceof LockBusyError) {
      return { success: false, error: 'Please try again in a moment' };
    }

    // A failure outside the slot loop: the lock itself, or an insert that
    // failed for a reason other than a taken slot. Logged with the cause,
    // since a constraint violation, a serialization failure and pool
    // exhaustion are indistinguishable without it.
    console.error('createAd failed before a slot was claimed', error);

    return { success: false, error: 'Could not create the ad' };
  }
}
