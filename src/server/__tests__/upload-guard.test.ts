// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_IMAGES_PER_AD } from '@/constants';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findAdOwnedByCurrentUser: vi.fn(),
    imageLimit: vi.fn(),
    ratelimitLimit: vi.fn(),
  },
}));

vi.mock('@/lib/ads', () => ({
  findAdOwnedByCurrentUser: mocks.findAdOwnedByCurrentUser,
}));
vi.mock('@/server/queries/select', () => ({ imageLimit: mocks.imageLimit }));
vi.mock('@/server/ratelimit', () => ({
  ratelimit: { limit: mocks.ratelimitLimit },
}));

const { checkUploadAdmission } = await import('../upload-guard');

const AD_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAdOwnedByCurrentUser.mockResolvedValue({
    ad: { id: AD_ID },
    userId: 'user-a',
  });
  mocks.imageLimit.mockResolvedValue({ success: true, count: 0, limit: 3 });
  mocks.ratelimitLimit.mockResolvedValue({ success: true });
});

describe('checkUploadAdmission', () => {
  it('admits an upload to an ad the caller owns', async () => {
    const result = await checkUploadAdmission(AD_ID);

    expect(result).toEqual({ ok: true });
  });

  it('refuses an upload aimed at another user ad', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    const result = await checkUploadAdmission(AD_ID);

    expect(result.ok).toBe(false);
  });

  it('refuses before spending storage on a file nobody may attach', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    await checkUploadAdmission(AD_ID);

    // Ownership is settled first: once the middleware returns, UploadThing
    // has already billed us for storing the file.
    expect(mocks.imageLimit).not.toHaveBeenCalled();
    expect(mocks.ratelimitLimit).not.toHaveBeenCalled();
  });

  it('does not reveal that the ad exists', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    const result = await checkUploadAdmission(AD_ID);

    expect(result.ok === false && result.reason).toBe('Not found');
  });

  it('refuses when the ad already has the maximum number of photos', async () => {
    mocks.imageLimit.mockResolvedValue({
      success: false,
      count: 3,
      limit: 3,
    });

    const result = await checkUploadAdmission(AD_ID);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('3 images');
  });

  it('refuses when the caller is rate limited', async () => {
    mocks.ratelimitLimit.mockResolvedValue({ success: false });

    const result = await checkUploadAdmission(AD_ID);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('Ratelimited');
  });

  it('rate limits by the session user, not by anything supplied', async () => {
    await checkUploadAdmission(AD_ID);

    expect(mocks.ratelimitLimit).toHaveBeenCalledWith('user-a');
  });

  it('checks the photo count for the requested ad, at the shared limit', async () => {
    await checkUploadAdmission(AD_ID);

    // MAX_IMAGES_PER_AD, not a bare 3: the form, the guard and the constant
    // must not drift apart.
    expect(mocks.imageLimit).toHaveBeenCalledWith(AD_ID, MAX_IMAGES_PER_AD);
  });

  it('fails closed when the rate limiter is unreachable', async () => {
    // Not an oversight: the comment in upload-guard.ts explains why this path
    // deliberately does *not* degrade the way the ad lock does. This test is
    // what stops someone adding a try/catch and silently opening an abuse
    // window during a Redis outage.
    mocks.ratelimitLimit.mockRejectedValue(new Error('fetch failed'));

    await expect(checkUploadAdmission(AD_ID)).rejects.toThrow('fetch failed');

    // Refusing before this point matters too: the file is already stored and
    // billed for by the time admission is denied.
    expect(mocks.imageLimit).not.toHaveBeenCalled();
  });
});
