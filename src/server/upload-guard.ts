import 'server-only';

import { findAdOwnedByCurrentUser } from '@/lib/ads';
import { imageLimit } from '@/server/queries/select';
import { ratelimit } from '@/server/ratelimit';
import { MAX_IMAGES_PER_AD } from '@/constants';

export type UploadAdmission = { ok: true } | { ok: false; reason: string };

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
   * upload is refused. That is intended, and it is deliberately *not* the same
   * choice `withUserLock` makes for the ad quota:
   *
   * - A quota is not an authorization boundary, so an unreachable Redis should
   *   not take ad creation down. That lock fails open and logs.
   * - Here the mechanism *is* the control. Failing open would let the rate
   *   limit be switched off by making Redis unreachable, which turns an outage
   *   into an abuse window. Storing a file nobody may attach is also a real
   *   cost, and UploadThing bills for it before `onUploadComplete` runs.
   *
   * So the asymmetry is the decision, not an oversight. Do not "fix" it toward
   * consistency with the ad lock: the two paths differ because the guarantees
   * they carry differ.
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

  return { ok: true };
}
