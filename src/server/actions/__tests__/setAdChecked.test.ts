// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compileWhere, constrainsColumn } from '@/test/drizzle-where';
import type { SQL } from 'drizzle-orm';

const AD_ID = '11111111-1111-4111-8111-111111111111';

const { mocks, dbMock } = vi.hoisted(() => {
  // The drizzle update chain captured at every step, for the reason
  // reportAd.test.ts gives: a mock that simply resolves proves nothing about
  // which rows the statement matches or what it writes.
  const returning = vi.fn(async () => [{ id: AD_ID }]);
  const where = vi.fn((_clause: SQL | undefined) => ({ returning }));
  const set = vi.fn((_values: unknown) => ({ where }));
  const update = vi.fn((_table: unknown) => ({ set }));

  return {
    mocks: {
      update,
      set,
      where,
      returning,
      requireUserId: vi.fn(),
      consoleError: vi.fn(),
    },
    dbMock: { update },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({ requireUserId: mocks.requireUserId }));

const { setAdChecked, clearAdChecked } = await import('../setAdChecked');

function predicate(): SQL | undefined {
  return mocks.where.mock.calls.at(-1)![0];
}

function compiledPredicate(): string {
  return compileWhere(predicate()).sql;
}

beforeEach(() => {
  vi.clearAllMocks();

  // The chain is re-established here, not just cleared. `clearAllMocks` drops
  // recorded calls but keeps implementations, so the `set` override installed by
  // the "never throws" test would otherwise survive into every test after it and
  // every one of them would report a driver failure. Restoring the wiring
  // per-test is what keeps the order of these tests irrelevant.
  mocks.update.mockImplementation((_table: unknown) => ({ set: mocks.set }));
  mocks.set.mockImplementation((_values: unknown) => ({ where: mocks.where }));
  mocks.where.mockImplementation((_clause: SQL | undefined) => ({
    returning: mocks.returning,
  }));

  vi.stubEnv('MODERATORS', 'moderator-1');
  mocks.requireUserId.mockResolvedValue('moderator-1');
  mocks.returning.mockResolvedValue([{ id: AD_ID }]);
  vi.spyOn(console, 'error').mockImplementation(mocks.consoleError);
});

describe('setAdChecked', () => {
  it('marks the ad checked and reports success', async () => {
    const result = await setAdChecked(AD_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ checkedAt: expect.any(Date) })
    );
  });

  it('clears the report in the same statement, so the ad leaves the queue', async () => {
    // One moderator decision, one write. "Reviewed and legitimate" and
    // "somebody reported this" are contradictory claims about one ad, and
    // leaving both set would mean the queue can only ever be emptied by
    // deleting ads -- the ad a moderator checked would sit in the queue
    // forever, indistinguishable from one nobody looked at.
    await setAdChecked(AD_ID);

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ reportedAt: null })
    );
  });

  it('matches only an ad nobody has checked yet', async () => {
    await setAdChecked(AD_ID);

    // First check wins, for the same reason the first report does: a second
    // click matches nothing, so the timestamp is the moment it was reviewed
    // rather than the moment somebody re-confirmed it. Revert the `isNull`
    // and this fails.
    expect(compiledPredicate()).toContain('"checkedAt"');
    expect(compiledPredicate()).toContain('is null');
  });

  it('does not constrain the ad by its owner', async () => {
    await setAdChecked(AD_ID);

    // Asserted both ways, so this cannot pass merely because the clause is
    // absent. There is no "owner may check their own ad" path: the allowlist is
    // the whole gate, exactly as in deleteAdAsModerator.
    expect(constrainsColumn(predicate(), 'id')).toBe(true);
    expect(constrainsColumn(predicate(), 'userId')).toBe(false);
  });

  it('binds the ad id rather than interpolating it', async () => {
    await setAdChecked(AD_ID);

    expect(compileWhere(predicate()).params).toContain(AD_ID);
  });

  describe('when the caller is not a moderator', () => {
    beforeEach(() => {
      mocks.requireUserId.mockResolvedValue('somebody-else');
    });

    it('writes nothing at all', async () => {
      // Asserted on the absence of the write, not on the returned error: a
      // version that checked and then refused would still return a refusal.
      const result = await setAdChecked(AD_ID);

      expect(result.success).toBe(false);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('gives the same refusal as a missing ad', async () => {
      // Identical answers, so the response cannot be used to discover that
      // MODERATORS is configured, who is on it, or which ad ids are real.
      const refused = await setAdChecked(AD_ID);
      const missing = await setAdChecked(
        '22222222-2222-4222-8222-222222222222'
      );

      expect(refused).toEqual(missing);
    });
  });

  describe('when MODERATORS is not configured', () => {
    it('refuses everyone, including a signed-in user', async () => {
      // Fails closed. An unset allowlist must not mean "everyone", or a fresh
      // clone would let anyone silence reports against any ad.
      vi.stubEnv('MODERATORS', '');
      mocks.requireUserId.mockResolvedValue('somebody-else');

      const result = await setAdChecked(AD_ID);

      expect(result.success).toBe(false);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('refuses when the variable is absent entirely', async () => {
      vi.stubEnv('MODERATORS', undefined);
      mocks.requireUserId.mockResolvedValue('somebody-else');

      await setAdChecked(AD_ID);

      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  it('refuses an anonymous caller without writing anything', async () => {
    vi.stubEnv('MODERATORS', '');
    mocks.requireUserId.mockResolvedValue(null);

    const result = await setAdChecked(AD_ID);

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a malformed ad id without querying', async () => {
    const result = await setAdChecked('not-a-uuid');

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports one message when no row matched', async () => {
    // Already checked, and no such ad, both land here and are deliberately not
    // told apart -- the same reasoning reportAd gives for its three refusals.
    mocks.returning.mockResolvedValue([]);

    const result = await setAdChecked(AD_ID);

    expect(result).toEqual({
      success: false,
      error: 'Could not check this ad',
    });
    // Nothing is logged: a refusal is the guard working, not a failure.
    expect(mocks.consoleError).not.toHaveBeenCalled();
  });

  it('reports a database failure without leaking its message', async () => {
    mocks.returning.mockRejectedValue(
      new Error('column "checkedAt" of relation "mampokoj_ads" does not exist')
    );

    const result = await setAdChecked(AD_ID);

    expect(result.success === false && result.error).toBe(
      'Could not check this ad'
    );
    expect(JSON.stringify(result)).not.toContain('mampokoj_ads');
    expect(mocks.consoleError).toHaveBeenCalled();
  });

  it('never throws, whatever the driver does', async () => {
    mocks.set.mockImplementation(() => {
      throw new Error('pool exhausted');
    });

    await expect(setAdChecked(AD_ID)).resolves.toEqual({
      success: false,
      error: 'Could not check this ad',
    });
  });
});

describe('clearAdChecked', () => {
  it('clears the flag and reports success', async () => {
    const result = await clearAdChecked(AD_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.set).toHaveBeenCalledWith({ checkedAt: null });
  });

  it('does not touch the report', async () => {
    // Asserted with an exact object, not objectContaining, so an added
    // `reportedAt` would fail here. Clearing a check must not re-file a report
    // nobody makes: the ad goes back to being merely unreviewed, and only a
    // real report can put it in the queue again.
    await clearAdChecked(AD_ID);

    expect(mocks.set).toHaveBeenCalledWith({ checkedAt: null });
  });

  it('matches only an ad that is actually checked', async () => {
    await clearAdChecked(AD_ID);

    // The mirror of `setAdChecked`'s isNull. Without it, clearing an ad nobody
    // checked would still move updatedAt on every row it was pressed against,
    // and would report success for an ad that was never in that state.
    expect(compiledPredicate()).toContain('"checkedAt"');
    expect(compiledPredicate()).toContain('is not null');
  });

  it('does not constrain the ad by its owner', async () => {
    await clearAdChecked(AD_ID);

    expect(constrainsColumn(predicate(), 'id')).toBe(true);
    expect(constrainsColumn(predicate(), 'userId')).toBe(false);
  });

  it('writes nothing for a caller who is not a moderator', async () => {
    mocks.requireUserId.mockResolvedValue('somebody-else');

    const result = await clearAdChecked(AD_ID);

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a malformed ad id without querying', async () => {
    const result = await clearAdChecked('not-a-uuid');

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports one message when no row matched', async () => {
    mocks.returning.mockResolvedValue([]);

    const result = await clearAdChecked(AD_ID);

    expect(result).toEqual({
      success: false,
      error: 'Could not uncheck this ad',
    });
    expect(mocks.consoleError).not.toHaveBeenCalled();
  });

  it('reports a database failure without leaking its message', async () => {
    mocks.returning.mockRejectedValue(
      new Error('permission denied for table mampokoj_ads')
    );

    const result = await clearAdChecked(AD_ID);

    expect(result.success === false && result.error).toBe(
      'Could not uncheck this ad'
    );
    expect(JSON.stringify(result)).not.toContain('mampokoj_ads');
    expect(mocks.consoleError).toHaveBeenCalled();
  });

  it('never throws, whatever the driver does', async () => {
    mocks.set.mockImplementation(() => {
      throw new Error('pool exhausted');
    });

    await expect(clearAdChecked(AD_ID)).resolves.toEqual({
      success: false,
      error: 'Could not uncheck this ad',
    });
  });
});