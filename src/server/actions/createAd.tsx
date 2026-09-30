'use server';

import { count, eq } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { parseAdFormData, type AdInput } from '@/lib/validation/ad-schema';
import { LockBusyError, withUserLock } from '@/server/user-lock';
import { MAX_ADS_PER_USER } from '@/constants';

async function countUserAds(userId: string) {
  const [row] = await db
    .select({ value: count(ads.id) })
    .from(ads)
    .where(eq(ads.userId, userId));

  return row?.value ?? 0;
}

/**
 * `success` is a literal discriminant, not a widened boolean: the create form
 * reads `res.userId` inside `if (res.success)`, which only narrows if the two
 * shapes stay distinguishable.
 */
export type CreateAdResult =
  | { success: true; adId: string; userId: string }
  | { success: false; error: string };

/**
 * Reads the count and inserts, under a per-user lock.
 *
 * The two statements are not atomic on their own: concurrent requests all read
 * the same count and all insert, so ten simultaneous submissions would produce
 * ten ads for a user allowed two. `withUserLock` serializes them across every
 * server instance, which is why the count and the insert live inside it rather
 * than being split around it.
 */
async function insertIfUnderLimit(
  userId: string,
  input: AdInput
): Promise<CreateAdResult> {
  const existing = await countUserAds(userId);

  if (existing >= MAX_ADS_PER_USER) {
    return {
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    };
  }

  try {
    const [created] = await db
      .insert(ads)
      // userId last: the session id must win over anything that came out of
      // the submitted form.
      .values({ ...input, userId })
      .returning({ id: ads.id });

    return { success: true, adId: created.id, userId };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to create ad');

    return {
      success: false,
      error: 'Could not create the ad',
    };
  }
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
    return await withUserLock(userId, () => insertIfUnderLimit(userId, parsed.data));
  } catch (error) {
    // Validation failures may explain themselves; this one is a retry, and it
    // deliberately does not say "someone else is creating an ad right now".
    if (error instanceof LockBusyError) {
      return { success: false, error: 'Please try again in a moment' };
    }

    // Logged with the cause: a constraint violation, a serialization failure
    // and pool exhaustion are indistinguishable without it.
    console.error('Failed to create ad', error);

    return { success: false, error: 'Could not create the ad' };
  }
}
