// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compileWhere, constrainsColumn } from '@/test/drizzle-where';
import type { SQL } from 'drizzle-orm';

const AD_ID = '11111111-1111-4111-8111-111111111111';

const { mocks, dbMock } = vi.hoisted(() => {
  const findFirst = vi.fn();
  const findMany = vi.fn(async (): Promise<{ fileKey: string }[]> => []);
  const where = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where }));

  return {
    mocks: {
      findFirst,
      findMany,
      where,
      del,
      deleteFiles: vi.fn(),
      requireUserId: vi.fn(),
      consoleError: vi.fn(),
    },
    dbMock: { query: { ads: { findFirst }, images: { findMany } }, delete: del },
  };
});

// Mocked at the boundary, not at the logic: `teardownAd` is deliberately NOT
// mocked, so "a non-moderator writes nothing" can be asserted against the real
// teardown. Mocking it would make that assertion decorative.
vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/server/storage', () => ({
  utapi: { deleteFiles: mocks.deleteFiles },
}));
vi.mock('@/lib/session', () => ({ requireUserId: mocks.requireUserId }));

const { deleteAdAsModerator } = await import('../deleteAdAsModerator');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MODERATORS', 'moderator-1');
  mocks.requireUserId.mockResolvedValue('moderator-1');
  mocks.findFirst.mockResolvedValue({ id: AD_ID });
  mocks.findMany.mockResolvedValue([{ fileKey: 'k1' }]);
  vi.spyOn(console, 'error').mockImplementation(mocks.consoleError);
});

describe('deleteAdAsModerator', () => {
  it('removes a reported ad for a moderator', async () => {
    const result = await deleteAdAsModerator(AD_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.deleteFiles).toHaveBeenCalledWith(['k1']);
    expect(mocks.del).toHaveBeenCalledTimes(2);
  });

  describe('when the caller is not a moderator', () => {
    beforeEach(() => {
      mocks.requireUserId.mockResolvedValue('somebody-else');
    });

    it('writes nothing at all', async () => {
      // The test that makes this action safe to add. It asserts on the *absence*
      // of every destructive call rather than on the returned error, because a
      // version that tore the ad down and then checked would still return an
      // error. Delete the isModerator call and this fails.
      const result = await deleteAdAsModerator(AD_ID);

      expect(result.success).toBe(false);
      expect(mocks.deleteFiles).not.toHaveBeenCalled();
      expect(mocks.del).not.toHaveBeenCalled();
      expect(mocks.findFirst).not.toHaveBeenCalled();
    });

    it('does not look the ad up either', async () => {
      // Even reading is refused. A lookup would cost a query and, if the
      // existence check ran first, would make the response reveal which ad ids
      // are real.
      await deleteAdAsModerator(AD_ID);

      expect(mocks.findFirst).not.toHaveBeenCalled();
    });

    it('gives the same refusal as a missing ad', async () => {
      // Identical to the not-found answer, so the response cannot be used to
      // discover that MODERATORS is configured or who is on it.
      const refused = await deleteAdAsModerator(AD_ID);
      const missing = await deleteAdAsModerator(
        '22222222-2222-4222-8222-222222222222'
      );

      expect(refused).toEqual(missing);
    });
  });

  describe('when MODERATORS is not configured', () => {
    it('refuses everyone, including a signed-in user', async () => {
      // Fails closed. An unset allowlist must not mean "everyone", or a fresh
      // clone or a Vercel preview without the variable would expose a takedown
      // button to anyone who signs in.
      vi.stubEnv('MODERATORS', '');
      mocks.requireUserId.mockResolvedValue('somebody-else');

      const result = await deleteAdAsModerator(AD_ID);

      expect(result.success).toBe(false);
      expect(mocks.del).not.toHaveBeenCalled();
    });

    it('refuses when the variable is absent entirely', async () => {
      vi.stubEnv('MODERATORS', undefined);
      mocks.requireUserId.mockResolvedValue('somebody-else');

      await deleteAdAsModerator(AD_ID);

      expect(mocks.del).not.toHaveBeenCalled();
    });
  });

  describe('the lookup it does perform', () => {
    it('is not constrained by the ad owner', async () => {
      // This is what distinguishes the moderator path from `deleteAdById` at the
      // SQL level rather than by name: no `"userId"` in the predicate. The
      // allowlist is the only gate, and it is not a database concern.
      await deleteAdAsModerator(AD_ID);

      const clause = mocks.findFirst.mock.calls.at(-1)![0].where as SQL;

      // Asserted both ways: the predicate really does constrain the id, so this
      // is not passing merely because the clause is absent.
      expect(compileWhere(clause).sql).toContain('"mampokoj_ads"."id" = ');
      expect(constrainsColumn(clause, 'userId')).toBe(false);
      expect(constrainsColumn(clause, 'id')).toBe(true);
    });

    it('selects only the id', async () => {
      await deleteAdAsModerator(AD_ID);

      expect(mocks.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ columns: { id: true } })
      );
    });
  });

  it('reports an ad that does not exist without writing', async () => {
    mocks.findFirst.mockResolvedValue(undefined);

    const result = await deleteAdAsModerator(AD_ID);

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('refuses a malformed id without querying', async () => {
    const result = await deleteAdAsModerator('not-a-uuid');

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('reports a teardown failure without leaking the driver message', async () => {
    mocks.deleteFiles.mockRejectedValue(
      new Error('permission denied for table mampokoj_ads')
    );

    const result = await deleteAdAsModerator(AD_ID);

    expect(result).toEqual({ success: false, error: 'Could not delete the ad' });
    expect(JSON.stringify(result)).not.toContain('mampokoj_ads');
    expect(mocks.consoleError).toHaveBeenCalled();
  });
});
