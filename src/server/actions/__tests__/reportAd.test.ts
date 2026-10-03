// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compileWhere } from '@/test/drizzle-where';
import type { SQL } from 'drizzle-orm';

const AD_ID = '11111111-1111-4111-8111-111111111111';

const { mocks, dbMock } = vi.hoisted(() => {
  // The drizzle update chain, captured at every step so the `where` clause that
  // would reach Postgres can be compiled and inspected. A mock that just
  // resolves proves nothing about which rows the statement matches.
  const returning = vi.fn(async () => [{ id: AD_ID }]);
  // Typed as taking the clause, so `calls.at(-1)[0]` is the predicate rather
  // than an empty tuple.
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

const { reportAd } = await import('../reportAd');

/** The predicate the update was built with, compiled to real SQL text. */
function compiledPredicate(): string {
  return compileWhere(mocks.where.mock.calls.at(-1)![0]).sql;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue('user-a');
  mocks.returning.mockResolvedValue([{ id: AD_ID }]);
  vi.spyOn(console, 'error').mockImplementation(mocks.consoleError);
});

describe('reportAd', () => {
  it('marks the ad and reports success', async () => {
    const result = await reportAd(AD_ID);

    expect(result).toEqual({ success: true });
    // Written as a value rather than left to a $defaultFn: this action is the
    // only writer, so it owns the timestamp.
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ reportedAt: expect.any(Date) })
    );
  });

  it('matches only an ad nobody has reported yet', async () => {
    await reportAd(AD_ID);

    // First report wins, enforced by the predicate rather than by a read. A
    // second report matches nothing and writes nothing, with no transaction
    // and no Redis -- the same reasoning that put the ad limit on the slot
    // index. Revert the `isNull` and this fails.
    const predicate = compiledPredicate();
    expect(predicate).toContain('"reportedAt"');
    expect(predicate).toContain('is null');
  });

  it('refuses to let a checked ad be reported again', async () => {
    await reportAd(AD_ID);

    // The whole point of the `checkedAt` column. A moderator who has reviewed an
    // ad and called it legitimate is not overruled by a later visitor: the update
    // matches only a row that is both unreported and unchecked, so it writes
    // nothing and the queue never sees it. Revert the `isNull(checkedAt)` and
    // this fails while every other test in this file still passes -- which is
    // why it is asserted here rather than trusted to the schema.
    const predicate = compiledPredicate();
    expect(predicate).toContain('"checkedAt"');
    expect(predicate).toContain('is null');
  });

  it('refuses to let a poster flag their own ad', async () => {
    mocks.requireUserId.mockResolvedValue('reporter');

    await reportAd(AD_ID);

    // Not decoration: the `userId` predicate is what keeps a poster out of the
    // moderation queue, and a mock returning a row would pass whether or not
    // it was there. Revert the `ne` and this fails.
    //
    // The id is asserted in `params` rather than in the SQL text, because it is
    // bound -- an interpolated id would be exactly the §4 trap where any
    // interpolation becomes a positional parameter anyway.
    const clause = mocks.where.mock.calls.at(-1)![0];
    expect(compiledPredicate()).toMatch(/"userId" <> \$/);
    expect(compileWhere(clause).params).toContain('reporter');
  });

  it('binds the reporter id rather than reading it from anywhere else', async () => {
    await reportAd(AD_ID);

    // The session id is the only source. If it were ever taken from an
    // argument or the submitted form, the self-report guard above would be
    // bypassable by sending someone else's id.
    const { params } = compileWhere(mocks.where.mock.calls.at(-1)![0]);
    expect(params).toContain('user-a');
  });

  it('refuses an anonymous caller without writing anything', async () => {
    mocks.requireUserId.mockResolvedValue(null);

    const result = await reportAd(AD_ID);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    // Asserting the absence of the write, not just the refusal: a version that
    // updated first and checked afterwards would pass a `success: false` check.
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses a malformed ad id without querying', async () => {
    const result = await reportAd('not-a-uuid');

    expect(result).toEqual({ success: false, error: 'Not found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports one message when no row matched', async () => {
    // Already reported, own ad, and no such ad all land here, and are
    // deliberately not told apart. "Already reported" would be a lie for a
    // self-report; three messages would leak which is which.
    mocks.returning.mockResolvedValue([]);

    const result = await reportAd(AD_ID);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe('Could not report this ad');
    // Nothing is logged: a refusal is the guard working, not a failure.
    expect(mocks.consoleError).not.toHaveBeenCalled();
  });

  it('does not tell the caller whether the ad exists', async () => {
    // The same message and the same shape whether a row matched or not, so the
    // response carries no information about the id space.
    mocks.returning.mockResolvedValue([]);
    const refused = await reportAd(AD_ID);

    mocks.returning.mockResolvedValue([{ id: AD_ID }]);
    const accepted = await reportAd(AD_ID);

    expect(refused.success === false && refused.error).toBe(
      'Could not report this ad'
    );
    expect(accepted).toEqual({ success: true });
  });

  it('reports a database failure without leaking its message', async () => {
    mocks.returning.mockRejectedValue(
      new Error('column "reportedAt" of relation "mampokoj_ads" does not exist')
    );

    const result = await reportAd(AD_ID);

    // The raw message names tables and columns, which is the same reason
    // deleteAd logs rather than returns.
    expect(result.success === false && result.error).toBe('Could not report this ad');
    expect(JSON.stringify(result)).not.toContain('mampokoj_ads');
    expect(mocks.consoleError).toHaveBeenCalled();
  });

  it('never throws, whatever the driver does', async () => {
    mocks.set.mockImplementation(() => {
      throw new Error('pool exhausted');
    });

    await expect(reportAd(AD_ID)).resolves.toEqual({
      success: false,
      error: 'Could not report this ad',
    });
  });
});
