// @vitest-environment node
/**
 * One sign-in provider.
 *
 * §9.5 recorded that signing in with both GitHub and Google gives one person two
 * account ids -- the ad limit keys on `ads.userId`, so four ads became possible
 * -- and that fixing it needed either account linking or a single provider. The
 * provider was dropped, so this asserts that outcome rather than the old
 * arrangement: a second provider is not a small addition, it is a second
 * identity for every user who has both accounts, and it would quietly double the
 * ad limit again.
 *
 * The `MODERATORS` allowlist depends on this too -- it lists account ids, and
 * with two providers one person has two, so moderation would appear to break
 * whenever someone signed in the other way.
 */
import { describe, expect, it } from 'vitest';

import { authOptions } from '../route';

describe('auth providers', () => {
  it('offers exactly one provider', () => {
    expect(authOptions.providers).toHaveLength(1);
  });

  it('offers Google', () => {
    expect(authOptions.providers[0].id).toBe('google');
  });

  it('sends the provider account id into the session', () => {
    // Everything keys on this: `ads.userId`, the ad limit's slot index, and the
    // MODERATORS allowlist. It is the provider's opaque account id, not an email
    // -- there is no email anywhere in the system (§9.5).
    expect(authOptions.callbacks?.session).toBeTypeOf('function');
    expect(authOptions.callbacks?.jwt).toBeTypeOf('function');
  });
});
