import 'server-only';

import { findAdOwnedByCurrentUser } from '@/lib/ads';
import { imageLimit } from '@/server/queries/select';
import { ratelimit } from '@/server/ratelimit';
import { MAX_IMAGES_PER_AD } from '@/constants';

export type UploadAdmission =
  | { ok: true; userId: string }
  | { ok: false; reason: string };

/**
 * Decides whether an upload may proceed, before any bytes are transferred.
 *
 * UploadThing stores the file first and only then runs `onUploadComplete`. If
 * ownership were checked there, as it was, an upload aimed at somebody else's
 * ad would be paid for and stored before being rejected -- leaving an orphaned
 * file in the bucket. Ownership is therefore settled here, in the middleware.
 *
 * The owner comes from the session; the `adId` in the upload input is
 * untrusted and is only ever used as a lookup key.
 *
 * The resolved `userId` is part of the return value because `onUploadComplete`
 * needs it and cannot get it for itself: UploadThing calls that hook
 * server-to-server, after the browser is done, so there is no session cookie on
 * the request and `requireUserId()` yields null. The owner settled here, in a
 * request that does have the cookie, is handed forward so ownership can be
 * re-checked at insert time without trusting anything the client supplied.
 */
export async function checkUploadAdmission(
  adId: string
): Promise<UploadAdmission> {
  const owned = await findAdOwnedByCurrentUser(adId);

  if (!owned) {
    return { ok: false, reason: 'Not found' };
  }

  /**
   * Deliberately not wrapped in a try/catch.
   *
   * If Redis is unreachable this throws out of the UploadThing middleware and the
   * upload is refused. That is intended:
   *
   * - Here the mechanism *is* the control. Failing open would let the rate
   *   limit be switched off by making Redis unreachable, which turns an outage
   *   into an abuse window. Storing a file nobody may attach is also a real
   *   cost, and UploadThing bills for it before `onUploadComplete` runs.
   * - The ad quota needs no such argument, because it is not implemented here at
   *   all: `MAX_ADS_PER_USER` is a unique index on (userId, slot), so an
   *   unreachable Redis cannot loosen it.
   *
   * This comment used to set that against an advisory Redis mutex which failed
   * open and logged. That mutex has been retired (HANDOFF §9.2), which leaves
   * this rate limiter as the only Redis dependency in the write path. Do not
   * "fix" it toward failing open -- there is no longer a second implementation
   * to be consistent with.
   */
  const { success: withinRateLimit } = await ratelimit.limit(owned.userId);

  if (!withinRateLimit) {
    return { ok: false, reason: 'Ratelimited' };
  }

  const photoCheck = await imageLimit(adId, MAX_IMAGES_PER_AD);

  if (!photoCheck.success) {
    return {
      ok: false,
      reason: `Max. ${MAX_IMAGES_PER_AD} images per ad`,
    };
  }

  return { ok: true, userId: owned.userId };
}
