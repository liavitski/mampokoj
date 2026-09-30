// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adFormData } from '@/test/ad-form-data';

const { mocks, dbMock } = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    mocks: { findAdOwnedByCurrentUser: vi.fn(), where, set, update },
    dbMock: { update },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
// Ownership is enforced inside this helper, by the query predicate. See
// src/lib/__tests__/ads.test.ts for how that predicate is verified.
vi.mock('@/lib/ads', () => ({
  findAdOwnedByCurrentUser: mocks.findAdOwnedByCurrentUser,
}));

const { updateAd } = await import('../updateAd');

const AD_ID = '11111111-1111-4111-8111-111111111111';

const OWNED = { ad: { id: AD_ID }, userId: 'user-a' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateAd', () => {
  it('updates the ad when the caller owns it', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(OWNED);

    const result = await updateAd(AD_ID, adFormData({ title: 'New title' }));

    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-a');
    expect(mocks.update).toHaveBeenCalled();
  });

  it('refuses to write when the caller does not own the ad', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    const result = await updateAd(AD_ID, adFormData());

    expect(result.success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('gives the same answer for "not yours" and "does not exist"', async () => {
    // Both collapse to null inside the helper, so the response cannot be used
    // to discover which ad ids exist.
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    const result = await updateAd(AD_ID, adFormData());

    expect(result.error).toBe('Not found');
  });

  it('checks ownership before writing', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(null);

    await updateAd(AD_ID, adFormData());

    expect(mocks.findAdOwnedByCurrentUser).toHaveBeenCalledWith(AD_ID);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports a database failure without leaking schema details', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(OWNED);
    mocks.update.mockImplementationOnce(() => {
      throw new Error(
        'value too long for type character varying(60), "mampokoj_ads"'
      );
    });

    const result = await updateAd(AD_ID, adFormData());

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('mampokoj_ads');
    expect(result.error).not.toContain('character varying');
  });

  it('rejects an invalid field without writing', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(OWNED);

    const result = await updateAd(AD_ID, adFormData({ title: '' }));

    expect(result.success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a title longer than the column allows', async () => {
    mocks.findAdOwnedByCurrentUser.mockResolvedValue(OWNED);

    const result = await updateAd(AD_ID, adFormData({ title: 'x'.repeat(61) }));

    expect(result.success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
