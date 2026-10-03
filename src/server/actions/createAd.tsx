'use server';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { parseAdFormData, type AdInput } from '@/lib/validation/ad-schema';
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
 * holds every one. Postgres is the referee, so the limit holds with no
 * application-side coordination at all -- no count is read first, so none
 * can go stale under a concurrent create.
 *
 * **This loop is the whole concurrency story, and it is why the ad lock was
 * retired.** Two simultaneous creates for one user both try slot 0; Postgres
 * admits exactly one and rejects the other with a 23505, which this loop reads
 * as "slot taken" and moves to slot 1. The loser spends one insert it did not
 * need, which is the entire cost -- it can never end up over the limit, because
 * the index refuses a duplicate pair rather than because anything was
 * serialized. `withUserLock` bought the avoidance of that one wasted insert and
 * nothing else, in exchange for a Redis mutex, a Lua release script and roughly
 * 800 lines of tests. See HANDOFF §9.2.
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
    return await insertIntoFreeSlot(userId, parsed.data);
  } catch (error) {
    /**
     * Only reachable for a failure the slot loop does not treat as a conflict --
     * a foreign-key violation, a serialization failure, pool exhaustion -- all of
     * which `insertIntoFreeSlot` rethrows rather than retrying. Logged with the
     * cause, since those are indistinguishable without it, and deliberately not
     * returned: the message names tables and constraints.
     */
    console.error('createAd failed outside the slot loop', error);

    return { success: false, error: 'Could not create the ad' };
  }
}
