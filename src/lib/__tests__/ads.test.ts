// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compileWhere, constrainsColumn } from '@/test/drizzle-where';

const { mocks, dbMock } = vi.hoisted(() => {
  const findFirst = vi.fn();

  return {
    mocks: { requireUserId: vi.fn(), findFirst },
    dbMock: { query: { ads: { findFirst } } },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({
  requireUserId: mocks.requireUserId,
}));

const { findAdOwnedByCurrentUser } = await import('../ads');

const AD_ID = '11111111-1111-4111-8111-111111111111';

function lastWhereClause(): SQL | undefined {
  return mocks.findFirst.mock.calls.at(-1)![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findAdOwnedByCurrentUser', () => {
  it('resolves the owner from the session rather than from arguments', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    mocks.findFirst.mockResolvedValue({ id: AD_ID });

    const result = await findAdOwnedByCurrentUser(AD_ID);

    expect(mocks.requireUserId).toHaveBeenCalled();
    expect(result).toEqual({ ad: { id: AD_ID }, userId: 'user-a' });
  });

  it('constrains the query by both ad id and owner', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    mocks.findFirst.mockResolvedValue({ id: AD_ID });

    await findAdOwnedByCurrentUser(AD_ID);

    const where = lastWhereClause();
    expect(constrainsColumn(where, 'id')).toBe(true);
    expect(constrainsColumn(where, 'userId')).toBe(true);
  });

  it('binds the session user id as a query parameter', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    mocks.findFirst.mockResolvedValue({ id: AD_ID });

    await findAdOwnedByCurrentUser(AD_ID);

    // The user id must be a bound parameter, not string-interpolated SQL.
    expect(compileWhere(lastWhereClause()).params).toEqual([AD_ID, 'user-a']);
  });

  it('returns null and skips the query when nobody is signed in', async () => {
    mocks.requireUserId.mockResolvedValue(undefined);

    const result = await findAdOwnedByCurrentUser(AD_ID);

    expect(result).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('returns null for a malformed ad id without querying', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');

    const result = await findAdOwnedByCurrentUser('not-a-uuid');

    expect(result).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when no ad matches the owner constraint', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    // The database found no row for (id, userId) -- either it does not exist
    // or it belongs to somebody else, and the two are deliberately
    // indistinguishable.
    mocks.findFirst.mockResolvedValue(undefined);

    const result = await findAdOwnedByCurrentUser(AD_ID);

    expect(result).toBeNull();
  });
});
