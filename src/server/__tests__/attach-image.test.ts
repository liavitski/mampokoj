// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks, dbMock } = vi.hoisted(() => {
  const findAdOwnedByUser = vi.fn();
  const insert = vi.fn(() => ({ values: vi.fn(async () => undefined) }));

  return {
    mocks: { findAdOwnedByUser, insert, deleteFiles: vi.fn() },
    dbMock: { insert },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
// Ownership is enforced inside this helper, by the query predicate. See
// src/lib/__tests__/ads.test.ts for how that predicate is verified.
vi.mock('@/lib/ads', () => ({
  findAdOwnedByUser: mocks.findAdOwnedByUser,
}));
vi.mock('@/server/storage', () => ({
  utapi: { deleteFiles: mocks.deleteFiles },
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

describe('addImageToAd compensates a failed attach', () => {
  // UploadThing has already stored and billed for the file by the time this
  // runs. Without compensation every failure here left a file in the bucket
  // that no database row referenced and neither delete flow could ever see,
  // because both of those work from `images.fileKey`.
  it('removes the uploaded file when the insert fails', async () => {
    mocks.insert.mockImplementationOnce(() => {
      throw new Error('duplicate key value violates unique constraint');
    });

    await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(mocks.deleteFiles).toHaveBeenCalledWith('key-1');
  });

  it('removes the uploaded file when the ad turns out not to be the caller’s', async () => {
    // The ad can be deleted between the middleware settling ownership and this
    // callback running, so the re-check here is the one that can refuse.
    mocks.findAdOwnedByUser.mockResolvedValue(null);

    await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(mocks.deleteFiles).toHaveBeenCalledWith('key-1');
  });

  it('leaves the file in place when the attach succeeds', async () => {
    await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it('still reports the failure when the compensating delete also fails', async () => {
    // The compensation is best-effort. If it throws, the upload callback has to
    // fail loudly rather than report success, or UploadThing keeps the file and
    // the client is told the photo was saved.
    mocks.insert.mockImplementationOnce(() => {
      throw new Error('insert failed');
    });
    mocks.deleteFiles.mockRejectedValueOnce(new Error('uploadthing is down'));

    const result = await addImageToAd({ adId: AD_ID, ...IMAGE });

    expect(result.success).toBe(false);
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
