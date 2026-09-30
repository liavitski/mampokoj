// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { toPublicAd } from '../ad-dto';
import type { AdWithImages } from '@/types/db-types';

const FULL_ROW: AdWithImages = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'oauth-account-id-42',
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

describe('toPublicAd', () => {
  it('drops the poster account id', () => {
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('userId');
  });

  it('drops the contact phone number', () => {
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('contactPhone');
  });

  it('does not leak the private values anywhere in the output', () => {
    const serialised = JSON.stringify(toPublicAd(FULL_ROW));

    expect(serialised).not.toContain('oauth-account-id-42');
    expect(serialised).not.toContain('+420776123456');
  });

  it('keeps the fields the ad grid renders', () => {
    expect(toPublicAd(FULL_ROW)).toEqual({
      id: FULL_ROW.id,
      title: 'Bright room',
      price: '8500.00',
      city: 'Prague',
      region: 'PR',
      availableFrom: FULL_ROW.availableFrom,
      description: 'A bright room.',
      createdAt: FULL_ROW.createdAt,
      updatedAt: FULL_ROW.updatedAt,
      images: [],
    });
  });

  it('is idempotent for an already-public ad', () => {
    const once = toPublicAd(FULL_ROW);

    expect(toPublicAd(once)).toEqual(once);
  });

  it('returns exactly the declared public fields and nothing else', () => {
    // Guards the barrier itself: if a new column were added to the ads table,
    // this pins that it does not appear until deliberately published.
    expect(Object.keys(toPublicAd(FULL_ROW)).sort()).toEqual([
      'availableFrom',
      'city',
      'createdAt',
      'description',
      'id',
      'images',
      'price',
      'region',
      'title',
      'updatedAt',
    ]);
  });
});
