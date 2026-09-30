// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks, dbMock } = vi.hoisted(() => {
  const findAdOwnedByCurrentUser = vi.fn();
  const insert = vi.fn(() => ({ values: vi.fn(async () => undefined) }));

  return {
    mocks: { findAdOwnedByCurrentUser, insert },
    dbMock: { insert },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
// Ownership is enforced inside this helper, by the query predicate. See
// src/lib/__tests__/ads.test.ts for how that predicate is verified.
vi.mock('@/lib/ads', () => ({
  findAdOwnedByCurrentUser: mocks.findAdOwnedByCurrentUser,
}));

const { addImageToAd } = await import('../addImageToAd');

const AD_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE = { url: 'https://example.test/photo.webp', fileKey: 'key-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addImageToAd', () => {
  it('attaches the image when the caller owns the ad', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue({
      ad: { id: AD_ID },
      userId: 'user-a',
    });

    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('refuses to write when the caller does not own the ad', async () => {
    // The helper returns null for "not yours" and "does not exist" alike.
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('checks ownership before touching the database', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(mocks.findAdOwnedByCurrentUser).toHaveBeenCalledWith(AD_ID);
  });

  it('reports a database failure without leaking schema details', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue({
      ad: { id: AD_ID },
      userId: 'user-a',
    });
    mocks.insert.mockImplementationOnce(() => {
      throw new Error(
        'duplicate key value violates unique constraint "mampokoj_images_filekey_key"'
      );
    });

    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('mampokoj_images_filekey_key');
  });
});
