// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const { createAd } = await import('../createAd');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearHeld();
  mocks.requireUserId.mockResolvedValue('user-a');
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

/**
 * The limit with no lock in the path at all.
 *
 * `withUserLock` was retired (HANDOFF §9.2), so these replace the eight tests
 * that asserted the lock was taken, named, held for the right user and released
 * on every path.
 *
 * The fake models the unique index faithfully: a pair already held throws a 23505
 * for any user, however many rows they have. A lost race is therefore
 * indistinguishable from "the other create already committed" -- which is exactly
 * why the index is a sufficient substitute for the mutex, and why these tests can
 * drive it sequentially and reach the same conclusions the lock used to.
 */
describe('createAd without a lock', () => {
  it('gives a second create for one user the next free slot', async () => {
    // The state a concurrent create leaves behind: the first has committed, so
    // the second finds its slot held and moves on rather than failing.
    await createAd(adFormData());
    const second = await createAd(adFormData());

    expect(second.success).toBe(true);
    expect(mocks.values.mock.calls.at(-1)![0].slot).toBe(1);
  });

  it('refuses the create after every slot is claimed, with no coordination', async () => {
    // What two racing creates can never achieve between them: a third row. The
    // refusal comes from exhausting the slots, not from anybody being told to wait.
    await createAd(adFormData());
    await createAd(adFormData());

    const third = await createAd(adFormData());

    expect(third).toEqual({
      success: false,
      error: `Maximum ${MAX_ADS_PER_USER} ads per user`,
    });
  });

  it('does not let one user over the limit by spending another user\'s slots', async () => {
    // The index is on the session user's id, so two different users claiming
    // slot 0 do not collide, and neither user's successes depend on the other's.
    await createAd(adFormData());
    mocks.requireUserId.mockResolvedValue('user-b');

    const other = await createAd(adFormData());

    expect(other.success).toBe(true);
    expect(mocks.values.mock.calls.at(-1)![0]).toMatchObject({
      userId: 'user-b',
      slot: 0,
    });
  });

  it('never reaches for Redis on the create path', async () => {
    // The point of the retirement, asserted directly. A lock reintroduced for the
    // serialization it used to buy would take Redis back out of the create path,
    // and this is the line that would notice.
    //
    // Comments stripped, because the doc comment on `insertIntoFreeSlot` has to
    // *name* `withUserLock` to explain why it is gone -- and an unstripped
    // assertion would fail on exactly the explanation that makes the retirement
    // legible.
    const source = readFileSync(
      join(process.cwd(), 'src/server/actions/createAd.tsx'),
      'utf8'
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    expect(source).not.toContain('user-lock');
    expect(source).not.toContain('withUserLock');
    expect(source).not.toContain('LockBusyError');
  });
});
