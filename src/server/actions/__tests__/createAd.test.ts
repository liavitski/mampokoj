// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adFormData } from '@/test/ad-form-data';
import { MAX_ADS_PER_USER } from '@/constants';

const { mocks, dbMock } = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: 'new-ad-id' }]);

  /**
   * The unique index on (userId, slot), as the database implements
   * it: a pair a row already holds rejects the insert with 23505,
   * which drizzle wraps with the driver error on `cause`.
   *
   * This is the primitive the limit is built from, not the limit
   * itself. The rule "at most MAX_ADS_PER_USER rows per user" is
   * what the action under test derives from the index, so the fake
   * must not know that number -- an insert is refused exactly when
   * the pair is held, for any user, however many rows they have.
   */
  const held = new Map<string, Set<number>>();

  const values = vi.fn((row: { userId: string; slot: number }) => {
    const slots = held.get(row.userId) ?? new Set<number>();

    if (slots.has(row.slot)) {
      const conflict = new Error(
        'duplicate key value violates unique constraint "mampokoj_ads_user_slot_unique"'
      );
      (conflict as { cause?: { code: string } }).cause = {
        code: '23505',
      };
      throw conflict;
    }

    slots.add(row.slot);
    held.set(row.userId, slots);

    return { returning };
  });

  const insert = vi.fn(() => ({ values }));

  return {
    mocks: {
      requireUserId: vi.fn(),
      returning,
      values,
      insert,
      withUserLock: vi.fn(),
      /** Puts a pair into the state a stored row leaves it in. */
      holdSlot: (userId: string, slot: number) => {
        const slots = held.get(userId) ?? new Set<number>();
        slots.add(slot);
        held.set(userId, slots);
      },
      clearHeld: () => held.clear(),
    },
    dbMock: { insert },
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
 * Order of events, so a test can assert that the insert happens
 * between acquiring and releasing the lock rather than merely nearby.
 */
let order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order = [];
  mocks.clearHeld();
  mocks.requireUserId.mockResolvedValue('user-a');
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
  it('creates into the first slot when the user holds none', async () => {
    const result = await createAd(adFormData());

    expect(result.success).toBe(true);
    // The pair the insert claims is the one the index enforces, and
    // the first slot is the first choice.
    expect(mocks.values.mock.calls[0]![0].slot).toBe(0);
  });

  it('creates into the next free slot when earlier ones are taken', async () => {
    mocks.holdSlot('user-a', 0);

    const result = await createAd(adFormData());

    expect(result.success).toBe(true);
    // The conflict on the held slot is data, not an error: the next
    // slot is tried, and the insert that succeeds is the one that
    // counts.
    expect(mocks.values.mock.calls.map((call) => call[0].slot)).toEqual([
      0, 1,
    ]);
  });

  it('refuses to create more ads once every slot is taken', async () => {
    for (let slot = 0; slot < MAX_ADS_PER_USER; slot += 1) {
      mocks.holdSlot('user-a', slot);
    }

    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    });
    // Every slot was tried and every attempt conflicted, which is the
    // only way the loop may end in a refusal.
    expect(mocks.values).toHaveBeenCalledTimes(MAX_ADS_PER_USER);
  });

  it('uses a slot that a deleted ad freed', async () => {
    // The user once held both slots; the first ad was deleted, so
    // slot 0 is free again while slot 1 is not.
    mocks.holdSlot('user-a', 1);

    const result = await createAd(adFormData());

    expect(result.success).toBe(true);
    expect(mocks.values.mock.calls[0]![0].slot).toBe(0);
  });

  it('does not treat another failure as a taken slot', async () => {
    // A foreign-key violation is also a 23xxx: only 23505 means this
    // slot is held. Anything else must surface as a real failure
    // rather than quietly trying the next slot.
    mocks.values.mockImplementationOnce(() => {
      const error = new Error('violates foreign key constraint');
      (error as { cause?: { code: string } }).cause = {
        code: '23503',
      };
      throw error;
    });

    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: false,
      error: 'Could not create the ad',
    });
    expect(mocks.values).toHaveBeenCalledTimes(1);
  });

  it('claims the slot for the session user, not the submitted one', async () => {
    await createAd(adFormData({ userId: 'someone-else' }));

    // The index is on the session user's id, so a form value cannot
    // move the limit onto somebody else's slots.
    const inserted = mocks.values.mock.calls[0]![0];
    expect(inserted.userId).toBe('user-a');
    expect(inserted.slot).toBe(0);
  });
});

describe('createAd concurrency', () => {
  it('inserts inside the lock, not merely next to it', async () => {
    // The insert is what claims the slot. Serializing it only works
    // if it happens inside the critical section; holding the lock
    // around anything else would still let two creates race for the
    // same free slot.
    await createAd(adFormData());

    expect(order).toEqual(['lock:acquire', 'insert', 'lock:release']);
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
    for (let slot = 0; slot < MAX_ADS_PER_USER; slot += 1) {
      mocks.holdSlot('user-a', slot);
    }

    const result = await createAd(adFormData());

    expect(result).toEqual({
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    });
    // Every slot was tried, and the lock is released even though the
    // section ended in a refusal.
    expect(order).toEqual([
      'lock:acquire',
      'insert',
      'insert',
      'lock:release',
    ]);
  });
});
