'use server';

import { eq } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { adIdSchema } from '@/lib/validation/ad-schema';
import { isModerator, parseModeratorAllowlist } from '@/lib/moderator-guard';
import { teardownAd } from '@/server/ad-teardown';

/**
 * Removes any ad, for a moderator. **This is the one place in the codebase that
 * deletes an ad the caller does not own.**
 *
 * A separate action rather than a flag on `deleteAdById`, deliberately. That
 * function's ownership check is the only thing between a session and a
 * deletion, so folding the bypass into it would mean the answer to "can
 * someone delete an ad they do not own?" is spread across two files. Here it is
 * one file, one gate, and greppable.
 *
 * The gate is the `MODERATORS` allowlist and nothing else -- not a role column,
 * not a permission table, not a flag on the ad. It is checked *before* any
 * lookup, so a non-moderator's request costs one session read and touches no
 * data. `deleteAdById` resolves ownership in the query predicate for the same
 * reason; here the predicate cannot express "is a moderator", because that
 * lives in an environment variable and not in the row.
 *
 * The refusal is 'Not found' rather than 'Not allowed', matching
 * `deleteAdById` and `findAdOwnedBy*`: the response then says nothing about
 * whether MODERATORS is configured, who is on it, or whether the ad exists.
 */
export async function deleteAdAsModerator(adId: string) {
  const userId = await requireUserId();

  if (!isModerator(userId, parseModeratorAllowlist(process.env.MODERATORS))) {
    return { success: false, error: 'Not found' };
  }

  const parsed = adIdSchema.safeParse(adId);

  if (!parsed.success) {
    return { success: false, error: 'Not found' };
  }

  // Existence only. No ownership predicate, and deliberately not
  // `findAdOwnedByCurrentUser`: the allowlist has already answered whether this
  // caller may remove the ad, and re-asking as "is this ad mine?" would be
  // false by definition for the case this action exists to serve.
  const existing = await db.query.ads.findFirst({
    where: eq(ads.id, parsed.data),
    columns: { id: true },
  });

  if (!existing) {
    return { success: false, error: 'Not found' };
  }

  try {
    await teardownAd(parsed.data);

    return { success: true };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error('Failed to delete reported ad', adId);

    return { success: false, error: 'Could not delete the ad' };
  }
}
