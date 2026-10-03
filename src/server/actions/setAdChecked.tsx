'use server';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '../db';
import { ads } from '../db/schema';
import { requireUserId } from '@/lib/session';
import { adIdSchema } from '@/lib/validation/ad-schema';
import { isModerator, parseModeratorAllowlist } from '@/lib/moderator-guard';

export type SetAdCheckedResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Marks an ad as reviewed-and-legitimate, for a moderator. After this the ad
 * cannot be reported again.
 *
 * Two columns move in one statement, deliberately. "A moderator looked at this
 * and it is fine" and "somebody reported this" are contradictory claims about
 * one ad, and resolving them separately would mean the report queue could only
 * ever be emptied by deleting ads -- an ad a moderator had checked would sit in
 * the queue looking identical to one nobody had looked at. So checking an ad is
 * the answer to a report, and it is written as one decision.
 *
 * The `checkedAt IS NULL` predicate is the same first-writer-wins reasoning
 * `reportAd` uses for `reportedAt`: a second click matches no rows, so the
 * timestamp is when the ad was reviewed rather than when somebody re-confirmed
 * it, and no transaction is needed -- which `db.transaction` cannot provide on
 * the neon-http driver (handoff.md §3).
 *
 * There is deliberately no "the owner may check their own ad" path and no
 * ownership predicate at all. This is the same gate `deleteAdAsModerator` uses:
 * the `MODERATORS` allowlist, checked before anything is read, because "may this
 * caller decide an ad is legitimate?" does not live in the row.
 *
 * The refusal is 'Not found', not 'Not allowed', matching `deleteAdAsModerator`
 * and `deleteAdById`. The response then says nothing about whether MODERATORS is
 * configured, who is on it, or whether the ad exists.
 */
export async function setAdChecked(adId: string): Promise<SetAdCheckedResult> {
  return write(
    adId,
    { checkedAt: new Date(), reportedAt: null },
    isNull(ads.checkedAt),
    'Could not check this ad',
    'Failed to check ad'
  );
}

/**
 * Removes a moderator's check, putting the ad back into a reportable state.
 *
 * The inverse, and it exists because "cannot be reported again" is a permanent
 * consequence of a single click: without this, a mis-click silences reports
 * against an ad until somebody edits the database by hand. Moderation decisions
 * are reversible here for the same reason `TakeDownButton` is not -- the damage
 * a mistaken check does is bounded (the ad becomes reportable again) and the
 * damage a mistaken takedown does is not (the listing and its photos are gone).
 *
 * `reportedAt` is not restored, and not touched. Clearing a check does not
 * invent a report: the ad goes back to being merely unreviewed, and only a real
 * report from a real visitor can put it in the queue again. Restoring it would
 * also resurrect a claim whose visitor we never recorded.
 *
 * The `checkedAt IS NOT NULL` predicate is the mirror of `setAdChecked`'s
 * `isNull`, for the same reason: an ad nobody checked matches no rows, so a
 * press against the wrong row moves no `updatedAt` and reports no false success.
 */
export async function clearAdChecked(
  adId: string
): Promise<SetAdCheckedResult> {
  return write(
    adId,
    { checkedAt: null },
    isNotNull(ads.checkedAt),
    'Could not uncheck this ad',
    'Failed to uncheck ad'
  );
}

/**
 * The one statement both directions are built from.
 *
 * Shared so the gate, the id parse, the column allowlist and the two refusals
 * cannot drift apart between them: a `clearAdChecked` that validated the uuid
 * but forgot the allowlist would be the exact bug this file exists to prevent.
 * `state` is passed in rather than built here because the two directions write
 * different columns -- one sets a timestamp, the other writes null over it.
 */
async function write(
  adId: string,
  state: Partial<typeof ads.$inferInsert>,
  onlyIf: SQL,
  failureMessage: string,
  logMessage: string
): Promise<SetAdCheckedResult> {
  const userId = await requireUserId();

  // Before any parse and any lookup, so a non-moderator's request costs one
  // session read and touches no data. Same ordering as deleteAdAsModerator.
  if (!isModerator(userId, parseModeratorAllowlist(process.env.MODERATORS))) {
    return { success: false, error: 'Not found' };
  }

  const parsed = adIdSchema.safeParse(adId);

  if (!parsed.success) {
    return { success: false, error: 'Not found' };
  }

  try {
    const changed = await db
      .update(ads)
      .set(state)
      .where(and(eq(ads.id, parsed.data), onlyIf))
      .returning({ id: ads.id });

    if (changed.length === 0) {
      return { success: false, error: failureMessage };
    }

    return { success: true };
  } catch {
    // Unexpected database failures are logged rather than returned: the raw
    // message can name tables, columns and constraints.
    console.error(logMessage, adId);

    return { success: false, error: failureMessage };
  }
}