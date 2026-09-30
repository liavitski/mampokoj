// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks, dbMock } = vi.hoisted(() => {
  const findAdOwnedByUser = vi.fn();
  const insert = vi.fn(() => ({ values: vi.fn(async () => undefined) }));

  return {
    mocks: { findAdOwnedByUser, insert },
    dbMock: { insert },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
// Ownership is enforced inside this helper, by the query predicate. See
// src/lib/__tests__/ads.test.ts for how that predicate is verified.
vi.mock('@/lib/ads', () => ({
  findAdOwnedByUser: mocks.findAdOwnedByUser,
}));

const { addImageToAd } = await import('../attach-image');

const AD_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE = {
  url: 'https://example.test/photo.webp',
  fileKey: 'key-1',
  userId: 'user-a',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAdOwnedByUser.mockResolvedValue({
    ad: { id: AD_ID },
    userId: 'user-a',
  });
});

describe('addImageToAd', () => {
  it('attaches the image when the ad belongs to the settled owner', async () => {
    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('refuses to write when the ad does not belong to that owner', async () => {
    // The helper returns null for "not yours" and "does not exist" alike.
    mocks.findAdOwnedByUser.mockResolvedValue(null);

    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('checks ownership before touching the database', async () => {
    mocks.findAdOwnedByUser.mockResolvedValue(null);

    await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(mocks.findAdOwnedByUser).toHaveBeenCalledWith(AD_ID, 'user-a');
  });

  it('does not read the session, which a callback request cannot carry', async () => {
    // The regression. `onUploadComplete` runs server-to-server with no session
    // cookie, so resolving the owner from the session returned null and every
    // real upload failed to attach -- silently, because the early return is not
    // the catch block, and after UploadThing had already stored and billed for
    // the file. The owner now arrives in metadata from the middleware, which
    // does run in the user's own request.
    const ads = await import('@/lib/ads');

    await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect('findAdOwnedByCurrentUser' in ads).toBe(false);
  });

  it('reports a database failure without leaking schema details', async () => {
    mocks.insert.mockImplementationOnce(() => {
      throw new Error(
        'duplicate key value violates unique constraint "mampokoj_images_filekey_key"'
      );
    });

    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('mampokoj_images_filekey_key');
  });
});

describe('addImageToAd is not a Server Action', () => {
  const source = readFileSync(
    new URL('../attach-image.ts', import.meta.url),
    'utf8'
  );

  it('is not marked "use server"', () => {
    // As a Server Action it would be reachable by direct POST, letting a
    // caller insert image rows carrying an arbitrary url while bypassing the
    // photo limit and the rate limit the upload middleware applies -- and a
    // forged row becomes the cover image of the public listing.
    //
    // Anchored to a whole line so the prose in the doc comment, which
    // mentions the directive by name, does not trip it.
    expect(source).not.toMatch(/^\s*['"]use server['"]\s*;?\s*$/m);
  });

  it('is marked server-only instead', () => {
    expect(source).toMatch(/import\s+['"]server-only['"]/);
  });
});
