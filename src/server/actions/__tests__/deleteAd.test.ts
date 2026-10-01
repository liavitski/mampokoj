// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks, dbMock } = vi.hoisted(() => {
  const findMany = vi.fn(async (): Promise<{ fileKey: string }[]> => []);
  const where = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where }));

  return {
    mocks: {
      findAdOwnedByCurrentUser: vi.fn(),
      findMany,
      where,
      del,
      deleteFiles: vi.fn(),
    },
    dbMock: { query: { images: { findMany } }, delete: del },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/ads', () => ({
  findAdOwnedByCurrentUser: mocks.findAdOwnedByCurrentUser,
}));
vi.mock('@/server/storage', () => ({
  utapi: { deleteFiles: mocks.deleteFiles },
}));

const { deleteAdById } = await import('../deleteAd');

const AD_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAdOwnedByCurrentUser.mockResolvedValue({
    ad: { id: AD_ID },
    userId: 'user-a',
  });
  mocks.findMany.mockResolvedValue([]);
});

describe('deleteAdById', () => {
  it('deletes an ad belonging to the caller', async () => {
    const result = await deleteAdById(AD_ID);

    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-a');
    expect(mocks.del).toHaveBeenCalled();
  });

  it('refuses to delete an ad the caller does not own', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    const result = await deleteAdById(AD_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it('removes the uploaded files alongside the ad', async () => {
    mocks.findMany.mockResolvedValue([{ fileKey: 'k1' }, { fileKey: 'k2' }]);

    await deleteAdById(AD_ID);

    expect(mocks.deleteFiles).toHaveBeenCalledWith(['k1', 'k2']);
  });

  it('does not call the upload API for an ad with no photos', async () => {
    mocks.findMany.mockResolvedValue([]);

    await deleteAdById(AD_ID);

    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it('does not surface a database error message to the caller', async () => {
    mocks.findMany.mockImplementationOnce(() => {
      throw new Error('permission denied for table mampokoj_ads');
    });

    const result = await deleteAdById(AD_ID);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('mampokoj_ads');
  });
});
