// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({ mocks: { findFirst: vi.fn() } }));

vi.mock('@/server/db', () => ({
  db: { query: { ads: { findFirst: mocks.findFirst } } },
}));

const { getValidatedAd } = await import('../select');

const AD_ID = '11111111-1111-4111-8111-111111111111';

const ROW = {
  id: AD_ID,
  userId: 'user-a',
  title: 'Bright room',
  price: '8500.00',
  city: 'Prague',
  region: 'PR',
  availableFrom: new Date('2026-01-15T00:00:00.000Z'),
  description: 'A bright room.',
  contactPhone: '+420776123456',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  images: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getValidatedAd', () => {
  it('returns the ad when it exists', async () => {
    mocks.findFirst.mockResolvedValue(ROW);

    const result = await getValidatedAd(AD_ID);

    expect(result).toEqual(ROW);
  });

  it('returns null for a malformed id without querying', async () => {
    const result = await getValidatedAd('not-a-uuid');

    expect(result).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('returns null for a well-formed id that matches no ad', async () => {
    // A page must be able to call notFound() for a deleted ad. Throwing here
    // turned a missing ad into an error page.
    mocks.findFirst.mockResolvedValue(undefined);

    const result = await getValidatedAd(AD_ID);

    expect(result).toBeNull();
  });

  it('never throws for an ad that does not exist', async () => {
    mocks.findFirst.mockResolvedValue(undefined);

    await expect(getValidatedAd(AD_ID)).resolves.toBeNull();
  });

  it('does not select the photo storage key for a single ad', async () => {
    mocks.findFirst.mockResolvedValue(ROW);

    await getValidatedAd(AD_ID);

    // The single-ad view is shown to visitors, who cannot delete photos, so
    // they have no use for fileKey -- which is the value
    // deletePhotoByFileKey takes.
    const imageColumns = mocks.findFirst.mock.calls.at(-1)![0].with.images
      .columns;
    expect(imageColumns).toBeDefined();
    expect(imageColumns).not.toHaveProperty('fileKey');
    expect(imageColumns.url).toBe(true);
  });
});
