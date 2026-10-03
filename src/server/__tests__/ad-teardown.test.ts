// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ads, images } from '@/server/db/schema';

const AD_ID = '11111111-1111-4111-8111-111111111111';

const { mocks, dbMock } = vi.hoisted(() => {
  // Order of events, so a test can assert the files are removed before the rows
  // that name them, rather than merely nearby.
  const order: string[] = [];

  const findMany = vi.fn(async () => {
    order.push('read fileKeys');
    return [{ fileKey: 'k1' }, { fileKey: 'k2' }] as { fileKey: string }[];
  });

  const deleteFiles = vi.fn(async () => {
    order.push('delete files');
  });

  const del = vi.fn((table: unknown) => {
    order.push(table === undefined ? 'delete' : 'delete rows');
    return {
      where: vi.fn(async () => {
        order.push('where');
      }),
    };
  });

  return {
    mocks: { order, findMany, deleteFiles, del },
    dbMock: { query: { images: { findMany } }, delete: del },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/server/storage', () => ({
  utapi: { deleteFiles: mocks.deleteFiles },
}));

const { teardownAd } = await import('../ad-teardown');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.findMany.mockResolvedValue([{ fileKey: 'k1' }, { fileKey: 'k2' }]);
});

describe('teardownAd', () => {
  it('reads the storage keys before it deletes any row', async () => {
    await teardownAd(AD_ID);

    // The order is the whole point of this function. `images.adId` cascades on
    // delete, so the rows could be removed in one statement -- but the fileKeys
    // have to be read first, and a cascade that fires before the read leaves
    // real files in a bucket that bills for them (handoff §2.2).
    expect(mocks.order.indexOf('read fileKeys')).toBeLessThan(
      mocks.order.indexOf('delete files')
    );
    expect(mocks.order.indexOf('delete files')).toBeLessThan(
      mocks.order.indexOf('delete rows')
    );
  });

  it('deletes the bucket files by their storage keys', async () => {
    await teardownAd(AD_ID);

    expect(mocks.deleteFiles).toHaveBeenCalledWith(['k1', 'k2']);
  });

  it('selects only the storage key', async () => {
    await teardownAd(AD_ID);

    // Reading whole rows would pull urls and timestamps in for nothing.
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ columns: { fileKey: true } })
    );
  });

  it('deletes the image rows and then the ad row', async () => {
    await teardownAd(AD_ID);

    const deletedTables = mocks.del.mock.calls.map((call) => call[0]);

    expect(deletedTables).toEqual([images, ads]);
  });

  it('does not call the upload API for an ad with no photos', async () => {
    mocks.findMany.mockResolvedValue([]);

    await teardownAd(AD_ID);

    // A pointless request that costs a round trip and can fail on an ad that
    // never had a photo.
    expect(mocks.deleteFiles).not.toHaveBeenCalled();
    expect(mocks.del).toHaveBeenCalledTimes(2);
  });

  it('rejects rather than resolving when the bucket call fails', async () => {
    mocks.deleteFiles.mockRejectedValue(new Error('uploadthing 500'));

    // The caller decides how to report this, so the failure has to propagate.
    // Swallowing it would delete the rows and orphan the files, which is the
    // exact drift §2.2 exists to catch.
    await expect(teardownAd(AD_ID)).rejects.toThrow('uploadthing 500');

    // And it must not go on to delete the rows that would lose the keys.
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
