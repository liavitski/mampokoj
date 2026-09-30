// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

import { adInputSchema } from '@/lib/validation/ad-schema';
import { images } from '@/server/db/schema';
import { MAX_IMAGES_PER_AD } from '@/constants';
import { toDateInputValue } from '../date';
import { formatCZPhone } from '../utils';
import { buildSeedAds, buildSeedImages } from '../seed-data';

/**
 * Enough rows that every branch of the generators runs, while staying fast.
 */
const SAMPLE = 100;

/** The `images` columns, which is the whole set an insert may name. */
const IMAGE_COLUMN_MAP: Record<string, { hasDefault: boolean }> =
  getTableColumns(images);
const IMAGE_COLUMNS = Object.keys(IMAGE_COLUMN_MAP).sort();

/** Keys the schema knows about, which is the subset a seeded row may name. */
const IMAGE_COLUMN_SET = new Set(IMAGE_COLUMNS);

/**
 * Columns Postgres will not fill in on its own. Derived rather than listed, so
 * adding a notNull column to `images` without a default breaks this test
 * instead of the seed run.
 */
const REQUIRED_IMAGE_COLUMNS = IMAGE_COLUMNS.filter(
  (name) => !IMAGE_COLUMN_MAP[name]!.hasDefault
).sort();

const IMAGE_FIXTURE = [
  { id: '11111111-1111-4111-8111-111111111111' },
  { id: '22222222-2222-4222-8222-222222222222' },
];

describe('buildSeedAds', () => {
  const ads = buildSeedAds(SAMPLE);

  it('returns the requested number of ads', () => {
    expect(ads).toHaveLength(SAMPLE);
  });

  it('produces rows that pass the same validation a real submission does', () => {
    for (const ad of ads) {
      const result = adInputSchema.safeParse({
        title: ad.title,
        price: ad.price,
        city: ad.city,
        region: ad.region,
        availableFrom: toDateInputValue(ad.availableFrom),
        description: ad.description,
        contactPhone: ad.contactPhone,
      });

      expect(
        result.success ? [] : result.error.issues.map((i) => i.message)
      ).toEqual([]);
    }
  });

  it('stores availableFrom at UTC midnight, so an edit round trip is stable', () => {
    for (const ad of ads) {
      expect(ad.availableFrom.getUTCHours()).toBe(0);
      expect(ad.availableFrom.getUTCMinutes()).toBe(0);
      expect(ad.availableFrom.getUTCSeconds()).toBe(0);
      expect(ad.availableFrom.getUTCMilliseconds()).toBe(0);
    }
  });

  it('formats phone numbers the way the ad cards render them', () => {
    for (const ad of ads) {
      expect(formatCZPhone(ad.contactPhone)).toMatch(
        /^\+420 \d{3} \d{3} \d{3}$/
      );
    }
  });

  it('gives every ad its own poster', () => {
    // Ads seeded with one shared userId would let a single dashboard own the
    // whole database and hide the pagination behaviour.
    expect(new Set(ads.map((ad) => ad.userId)).size).toBe(SAMPLE);
  });

  it('staggers createdAt so listing order is a total order', () => {
    // The listing paginates on (createdAt, id). Ads created in the same
    // millisecond would make the page boundaries non-deterministic.
    const created = ads.map((ad) => ad.createdAt);

    for (const value of created) expect(value).toBeInstanceOf(Date);

    const timestamps = created.map((value) => value!.getTime());

    expect(new Set(timestamps).size).toBe(ads.length);

    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i]!).toBeLessThan(timestamps[i - 1]!);
    }
  });
});

describe('buildSeedImages', () => {
  const rows = buildSeedImages(IMAGE_FIXTURE);

  it('names only real columns on the images table', () => {
    // The bug this suite exists for: the builder set `userId` on an image row.
    // `images` has no such column, so Postgres rejected the insert and the
    // seed script had never successfully run. TypeScript did not catch it --
    // excess-property checking does not reach through `flatMap` inference.
    for (const row of rows) {
      expect(
        Object.keys(row).filter((key) => !IMAGE_COLUMN_SET.has(key))
      ).toEqual([]);
    }
  });

  it('names every column Postgres cannot default', () => {
    expect(REQUIRED_IMAGE_COLUMNS).toEqual(['adId', 'fileKey', 'url']);

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(REQUIRED_IMAGE_COLUMNS);
    }
  });

  it('gives every image an ad that exists in the fixture', () => {
    const adIds = new Set(IMAGE_FIXTURE.map((ad) => ad.id));

    for (const row of rows) {
      expect(adIds.has(row.adId)).toBe(true);
    }
  });

  it('stays within the per-ad photo limit', () => {
    for (const ad of IMAGE_FIXTURE) {
      const forThisAd = rows.filter((row) => row.adId === ad.id);

      expect(forThisAd.length).toBeGreaterThan(0);
      expect(forThisAd.length).toBeLessThanOrEqual(MAX_IMAGES_PER_AD);
    }
  });

  it('produces fileKeys the shape check in deletePhoto accepts', () => {
    // Mirrors `fileKeySchema` in src/server/actions/deletePhoto.tsx. A key that
    // fails it is rejected as "Not found" before UploadThing is ever called,
    // so it would never delete the matching row.
    for (const row of rows) {
      expect(row.fileKey).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(row.fileKey.length).toBeLessThanOrEqual(255);
    }
  });

  it('produces fileKeys the unique index on the column will accept', () => {
    // The column is varchar(255) UNIQUE and there are only 11 photo URLs to
    // share between every seeded row, so a repeated key would reject the whole
    // image insert.
    const keys = rows.map((row) => row.fileKey);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing for no ads', () => {
    expect(buildSeedImages([])).toEqual([]);
  });
});