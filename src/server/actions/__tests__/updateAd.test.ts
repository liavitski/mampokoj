// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adFormData } from '@/test/ad-form-data';

const { mocks, dbMock } = vi.hoisted(() => {
  const findFirst = vi.fn();
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    mocks: {
      requireUserId: vi.fn(),
      findFirst,
      where,
      set,
      update,
    },
    dbMock: { query: { ads: { findFirst } }, update },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/require-user-id', () => ({
  requireUserId: mocks.requireUserId,
}));

const { updateAd } = await import('../updateAd');

// Real UUIDs, because ownership is resolved by a query that validates the id.
// Non-UUID fixtures would make every rejection test pass for the wrong reason.
const OWN_AD_ID = '11111111-1111-4111-8111-111111111111';
const VICTIM_AD_ID = '22222222-2222-4222-8222-222222222222';
const MALFORMED_AD_ID = 'not-a-uuid';

const OWNED_AD = { id: OWN_AD_ID };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateAd authorization', () => {
  it('rejects the request when nobody is signed in', async () => {
    mocks.requireUserId.mockResolvedValue(undefined);
    mocks.findFirst.mockResolvedValue(OWNED_AD);

    const result = await updateAd(OWN_AD_ID, adFormData());

    expect(result.success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects the request when the ad belongs to a different user', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    // The ownership query returns nothing for an ad user-a does not own.
    mocks.findFirst.mockResolvedValue(undefined);

    const result = await updateAd(VICTIM_AD_ID, adFormData());

    expect(result.success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not reveal that the ad exists to a non-owner', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    mocks.findFirst.mockResolvedValue(undefined);

    const result = await updateAd(VICTIM_AD_ID, adFormData());

    expect(result.error).toBe('Not found');
  });

  it('rejects a malformed ad id without querying for it', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');

    const result = await updateAd(MALFORMED_AD_ID, adFormData());

    expect(result.success).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup to the signed-in user', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    mocks.findFirst.mockResolvedValue(OWNED_AD);

    await updateAd(OWN_AD_ID, adFormData());

    // Ownership must be part of the query itself, not a client-side
    // comparison performed after the row has already been read.
    const whereArg = mocks.findFirst.mock.calls[0]![0].where;
    expect(whereArg).toBeDefined();
  });

  it('updates the ad when the signed-in user owns it', async () => {
    mocks.requireUserId.mockResolvedValue('user-a');
    mocks.findFirst.mockResolvedValue(OWNED_AD);

    const result = await updateAd(
      OWN_AD_ID,
      adFormData({ title: 'New title' })
    );

    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-a');
    expect(mocks.update).toHaveBeenCalled();
  });
});
