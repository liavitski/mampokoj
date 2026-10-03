// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { toPublicAd } from '../ad-dto';
import type { AdWithImages } from '@/types/db-types';

const IMAGE_ROW = {
  id: 'image-1',
  adId: '11111111-1111-4111-8111-111111111111',
  url: 'https://example.test/photo.webp',
  // The UploadThing storage key. It is the argument to deletePhotoByFileKey,
  // so it has no business in a public payload.
  fileKey: 'SECRET_STORAGE_KEY',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const FULL_ROW: AdWithImages = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'oauth-account-id-42',
  slot: 0,
  title: 'Bright room',
  price: '8500.00',
  city: 'Prague',
  region: 'PR',
  availableFrom: new Date('2026-01-15T00:00:00.000Z'),
  description: 'A bright room.',
  contactPhone: '+420776123456',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  // A real timestamp rather than null, so a leak shows up as a recognisable
  // value in the serialised output below instead of as an absent-looking null.
  reportedAt: new Date('2026-02-02T00:00:00.000Z'),
  // Also a real timestamp, and also worth watching for: `checkedAt` is what
  // makes an ad unreportable, so publishing it would hand every client a list of
  // the ads that moderation has already ruled on.
  checkedAt: new Date('2026-03-03T00:00:00.000Z'),
  images: [IMAGE_ROW],
};

describe('toPublicAd', () => {
  it('drops the poster account id', () => {
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('userId');
  });

  it('drops the contact phone number', () => {
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('contactPhone');
  });

  it('drops the ad slot', () => {
    // The slot is how the database enforces the per-user
    // limit. It is server machinery, so it leaves with the
    // poster id rather than riding along in the payload.
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('slot');
  });

  it('drops the moderation flag', () => {
    // `reportedAt` is moderation state, not a property of the room. Publishing
    // it would label an ad as reported to everyone, and -- because the queue
    // filters on `IS NOT NULL` -- would let anyone probe which ad ids have been
    // reported by watching for its presence.
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('reportedAt');
    expect(JSON.stringify(toPublicAd(FULL_ROW))).not.toContain(
      '2026-02-02T00:00:00.000Z'
    );
  });

  it('drops the checked flag', () => {
    // The same barrier, twice. `checkedAt` is the column that decides an ad is
    // solid and therefore unreportable, so a payload carrying it would publish
    // the exact list of ads nobody can complain about -- which is the map an
    // abuser wants. Drop `checkedAt` from `PublicAd` and this is the test that
    // notices.
    expect(toPublicAd(FULL_ROW)).not.toHaveProperty('checkedAt');
    expect(JSON.stringify(toPublicAd(FULL_ROW))).not.toContain(
      '2026-03-03T00:00:00.000Z'
    );
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
      images: [
        {
          id: IMAGE_ROW.id,
          url: IMAGE_ROW.url,
          createdAt: IMAGE_ROW.createdAt,
        },
      ],
    });
  });

  it('does not leak the photo storage key', () => {
    // The ad columns are allowlisted, but the nested images relation used to
    // pass straight through, carrying fileKey -- the value
    // deletePhotoByFileKey takes -- to every client.
    const serialised = JSON.stringify(toPublicAd(FULL_ROW));

    expect(serialised).not.toContain('SECRET_STORAGE_KEY');
  });

  it('does not leak the photo ad id', () => {
    expect(JSON.stringify(toPublicAd(FULL_ROW))).not.toContain(
      '"adId"'
    );
  });

  it('keeps only the public fields of each photo', () => {
    const [image] = toPublicAd(FULL_ROW).images;

    expect(image).toEqual({
      id: IMAGE_ROW.id,
      url: IMAGE_ROW.url,
      createdAt: IMAGE_ROW.createdAt,
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
