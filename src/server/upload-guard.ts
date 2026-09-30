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
