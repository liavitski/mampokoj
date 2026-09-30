// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adFormData } from '@/test/ad-form-data';
import { compileWhere } from '@/test/drizzle-where';
import { MAX_ADS_PER_USER } from '@/constants';

const { mocks, dbMock } = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: 'new-ad-id' }]);
  const values = vi.fn((_row: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const countRows = vi.fn(async (): Promise<{ value: number }[]> => [
    { value: 0 },
  ]);
  const countWhere = vi.fn((_clause: unknown) => countRows());
  const from = vi.fn(() => ({ where: countWhere }));
  const select = vi.fn(() => ({ from }));

  return {
    mocks: {
      requireUserId: vi.fn(),
      returning,
      values,
      insert,
      countRows,
      countWhere,
      select,
      withUserLock: vi.fn(),
    },
    dbMock: { insert, select },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({
  requireUserId: mocks.requireUserId,
}));
vi.mock('@/server/user-lock', async () => {
  // The real class, so `instanceof` in the action still discriminates.
  const actual = await vi.importActual<
    typeof import('@/server/user-lock')
  >('@/server/user-lock');

  return { ...actual, withUserLock: mocks.withUserLock };
});

const { createAd } = await import('../createAd');
const { LockBusyError } = await import('@/server/user-lock');

/**
 * Order of events, so a test can assert that the count and the insert happen
 * between acquiring and releasing the lock rather than merely nearby.
 */
let order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order = [];
  mocks.requireUserId.mockResolvedValue('user-a');
  mocks.countRows.mockImplementation(async () => {
    order.push('count');

    return [{ value: 0 }];
  });
  mocks.insert.mockImplementation(() => {
    order.push('insert');

    return { values: mocks.values };
  });
  // Runs the critical section immediately, as a free lock would.
  mocks.withUserLock.mockImplementation(
    async (userId: string, fn: () => Promise<unknown>) => {
      order.push('lock:acquire');

      try {
        return await fn();
      } finally {
        order.push('lock:release');
      }
    }
  );
});

describe('createAd validation', () => {
  it('creates an ad from a valid submission', async () => {
    const result = await createAd(adFormData());

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('rejects an over-long title without touching the database', async () => {
    const result = await createAd(adFormData({ title: 'x'.repeat(200) }));

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects a title sent as a file', async () => {
    const formData = adFormData();
    formData.set('title', new File(['x'], 'title.txt'));

    const result = await createAd(formData);

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects an unparseable date instead of writing Invalid Date', async () => {
    const result = await createAd(adFormData({ availableFrom: 'soon' }));

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not surface a database error message to the caller', async () => {
    mocks.insert.mockImplementationOnce(() => {
      throw new Error(
        'duplicate key value violates unique constraint "mampokoj_ads_pkey"'
      );
    });

    const result = await createAd(adFormData());

    // Validation failures may explain themselves; unexpected database
    // failures must not leak schema details.
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).not.toContain(
      'mampokoj_ads_pkey'
    );
  });
});

describe('createAd authorization', () => {
  it('rejects the request when nobody is signed in', async () => {
    mocks.requireUserId.mockResolvedValue(undefined);

    const result = await createAd(adFormData());

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('never lets the caller choose which user the ad belongs to', async () => {
    await createAd(adFormData({ userId: 'someone-else' }));

    const inserted = mocks.values.mock.calls[0]![0];
    expect(inserted.userId).toBe('user-a');
  });
});

describe('createAd ad limit', () => {
  it('allows creating an ad below the limit', async () => {
    mocks.countRows.mockResolvedValue([{ value: 1 }]);

    const result = await createAd(adFormData());

    expect(result.success).toBe(true);
  });

  it('refuses to create more ads once the limit is reached', async () => {
    mocks.countRows.mockResolvedValue([{ value: MAX_ADS_PER_USER }]);

    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('allows creating an ad right up to the limit', async () => {
    mocks.countRows.mockResolvedValue([{ value: MAX_ADS_PER_USER - 1 }]);

    const result = await createAd(adFormData());

    expect(result.success).toBe(true);
  });

  it('counts only the caller own ads', async () => {
    mocks.countRows.mockResolvedValue([{ value: 0 }]);

    await createAd(adFormData());

    // A count of every ad in the table would lock every user out as soon as
    // anyone filled up, so the count must be scoped by the session's user id.
    const where = mocks.countWhere.mock.calls.at(-1)![0] as SQL;
    const compiled = compileWhere(where);

    expect(compiled.sql).toContain('"userId"');
    expect(compiled.params).toEqual(['user-a']);
  });
});

describe('createAd concurrency', () => {
  it('counts and inserts inside the lock, not merely next to it', async () => {
    // The count and the insert are two separate statements. Serializing them
    // only works if both are inside the critical section; holding the lock
    // across the count alone would still let the insert race.
    await createAd(adFormData());

    expect(order).toEqual([
      'lock:acquire',
      'count',
      'insert',
      'lock:release',
    ]);
  });

  it('holds the lock for the session user, not one supplied by the form', async () => {
    await createAd(adFormData({ userId: 'someone-else' }));

    expect(mocks.withUserLock.mock.calls[0]![0]).toBe('user-a');
  });

  it('names the lock it takes', async () => {
    // The operation is part of the Redis key, so a second create path using a
    // different name would neither contend with this one nor inherit its
    // guarantee. Naming it at the call site makes that a visible edit.
    await createAd(adFormData());

    expect(mocks.withUserLock.mock.calls[0]![2]).toBe('create-ad');
  });

  it('does not take the lock when the submission is invalid', async () => {
    await createAd(adFormData({ title: '' }));

    // Nothing is written, so there is nothing to serialize.
    expect(mocks.withUserLock).not.toHaveBeenCalled();
  });

  it('does not take the lock when nobody is signed in', async () => {
    mocks.requireUserId.mockResolvedValue(undefined);

    await createAd(adFormData());

    expect(mocks.withUserLock).not.toHaveBeenCalled();
  });

  it('asks the caller to retry when the lock is held elsewhere', async () => {
    mocks.withUserLock.mockRejectedValue(new LockBusyError());

    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: false,
      error: 'Please try again in a moment',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not report a busy lock as a server error', async () => {
    mocks.withUserLock.mockRejectedValue(new LockBusyError());

    const result = await createAd(adFormData());

    // The user can fix this by waiting; telling them the server broke is wrong.
    expect(result.success === false && result.error).toMatch(/try again/i);
  });

  it('does not leak an unexpected failure through the lock', async () => {
    mocks.withUserLock.mockRejectedValue(
      new Error('ECONNRESET 10.0.0.5:6379')
    );

    const result = await createAd(adFormData());

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).not.toContain('6379');
  });

  it('reports the limit normally while holding the lock', async () => {
    mocks.countRows.mockImplementation(async () => {
      order.push('count');

      return [{ value: MAX_ADS_PER_USER }];
    });

    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    });
    // The lock is released even though the section declined to insert.
    expect(order).toEqual(['lock:acquire', 'count', 'lock:release']);
  });
});
