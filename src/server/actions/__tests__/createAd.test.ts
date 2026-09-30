// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adFormData } from '@/test/ad-form-data';

const { mocks, dbMock } = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: 'new-ad-id' }]);
  const values = vi.fn((_row: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const countRows = vi.fn(async () => [{ value: 0 }]);
  const where = vi.fn(() => countRows());
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    mocks: {
      requireUserId: vi.fn(),
      returning,
      values,
      insert,
      countRows,
      select,
    },
    dbMock: { insert, select },
  };
});

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/lib/session', () => ({
  requireUserId: mocks.requireUserId,
}));

const { createAd } = await import('../createAd');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue('user-a');
  mocks.countRows.mockResolvedValue([{ value: 0 }]);
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
    mocks.countRows.mockResolvedValue([{ value: 2 }]);

    const result = await createAd(adFormData());

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('enforces the limit on the server, not only in the UI', async () => {
    mocks.countRows.mockResolvedValue([{ value: 2 }]);

    await createAd(adFormData());

    // The dashboard hides the form at the limit, but the action must not rely
    // on that.
    expect(mocks.select).toHaveBeenCalled();
  });
});
