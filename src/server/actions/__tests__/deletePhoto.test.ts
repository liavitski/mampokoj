// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compileWhere, constrainsColumn } from '@/test/drizzle-where';

const { mocks, dbMock } = vi.hoisted(() => {
  const findFirst = vi.fn();
  const del = vi.fn(() => ({ where: vi.fn(async () => undefined) }));

  // Records the correlated subquery's predicate. The mock is not a real
  // Drizzle builder, so the subquery's bound parameters cannot survive being
  // wrapped in exists(); capturing the predicate lets it be compiled and
  // inspected directly.
  const subqueryWhere = { current: undefined as unknown };
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((clause: unknown) => {
        subqueryWhere.current = clause;
        return { clause };
      }),
    })),
  }));

  return {
    mocks: {
      requireUserId: vi.fn(),
      findFirst,
      del,
      select,
      subqueryWhere,
      deleteFiles: vi.fn(),
    },
    dbMock: {
      query: { images: { findFirst } },
      delete: del,
      select,
    },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({
  requireUserId: mocks.requireUserId,
}));
vi.mock('@/app/api/uploadthing/core', () => ({
  utapi: { deleteFiles: mocks.deleteFiles },
}));

const { deletePhotoByFileKey } = await import('../deletePhoto');

const FILE_KEY = 'abc123XYZ_-';

function lastWhereClause(): SQL | undefined {
  return mocks.findFirst.mock.calls.at(-1)![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue('user-a');
  mocks.findFirst.mockResolvedValue({
    id: 'image-1',
    fileKey: FILE_KEY,
  });
});

describe('deletePhotoByFileKey', () => {
  it('deletes a photo belonging to the caller', async () => {
    const result = await deletePhotoByFileKey(FILE_KEY);

    expect(result.success).toBe(true);
    expect(mocks.deleteFiles).toHaveBeenCalledWith(FILE_KEY);
  });

  it('rejects the request when nobody is signed in', async () => {
    mocks.requireUserId.mockResolvedValue(undefined);

    const result = await deletePhotoByFileKey(FILE_KEY);

    expect(result.success).toBe(false);
    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it('refuses when no photo matches the ownership constraint', async () => {
    // Nothing found for (fileKey, owned by this user): either it does not
    // exist or it belongs to somebody else.
    mocks.findFirst.mockResolvedValue(undefined);

    const result = await deletePhotoByFileKey(FILE_KEY);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it('settles ownership in the query, before the photo is loaded', async () => {
    await deletePhotoByFileKey(FILE_KEY);

    // The photo lookup is constrained by file key...
    expect(constrainsColumn(lastWhereClause(), 'fileKey')).toBe(true);

    // ...and combined with an EXISTS whose predicate proves the photo's ad
    // belongs to the session user, correlated on the photo's own adId.
    const subquery = compileWhere(
      mocks.subqueryWhere.current as SQL | undefined
    );
    expect(subquery.sql).toContain('"userId"');
    expect(subquery.sql).toContain('"adId"');
    expect(subquery.params).toEqual(['user-a']);
  });

  it('rejects a malformed file key without querying', async () => {
    const result = await deletePhotoByFileKey("'; DROP TABLE ads; --");

    expect(result.success).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.deleteFiles).not.toHaveBeenCalled();
  });

  it('does not surface a database error message to the caller', async () => {
    mocks.findFirst.mockImplementationOnce(() => {
      throw new Error('relation "mampokoj_images" does not exist');
    });

    const result = await deletePhotoByFileKey(FILE_KEY);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('mampokoj_images');
  });
});
