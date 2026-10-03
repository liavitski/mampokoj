// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

import { adInputSchema } from '@/lib/validation/ad-schema';
import { images } from '@/server/db/schema';
import { MAX_IMAGES_PER_AD } from '@/constants';
import { toDateInputValue } from '../date';
import { formatCZPhone } from '../utils';
import { buildSeedAds, buildSeedImages, seededPhotoUrl } from '../seed-data';

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
    // The column is varchar(255) UNIQUE, so a repeated key would reject the
    // whole image insert.
    const keys = rows.map((row) => row.fileKey);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing for no ads', () => {
    expect(buildSeedImages([])).toEqual([]);
  });
});

describe('seededPhotoUrl', () => {
  /**
   * The defect this replaces. All 11 previously-hardcoded `ufs.sh` URLs answer
   * 404, so 380 rows rendered a broken thumbnail and every seeded ad's share
   * card pointed at nothing. Measured by GET, not inferred from a HEAD.
   *
   * The assertion is on the *shape* rather than on a live fetch: a test that
   * called picsum would fail on a network blip and pass on a 404 that only
   * appears in production. The reachability of these URLs was verified by hand
   * and is recorded in `seed-data.ts`.
   */
  it('points at a host that resolves, not at a dead bucket path', () => {
    expect(seededPhotoUrl('11111111-1111-4111-8111-111111111111', 0)).toBe(
      'https://picsum.photos/seed/mampokoj-11111111-1111-4111-8111-111111111111-0/800/600'
    );
  });

  it('contains no dead UploadThing path', () => {
    // A regression guard with a name: the URLs this replaces were all of this
    // form, and putting one back would be invisible in a test that only checked
    // "looks like a URL".
    expect(seededPhotoUrl('ad-1', 0)).not.toContain('ufs.sh');
  });

  it('is deterministic, so a re-seed does not reshuffle an ad\'s photos', () => {
    expect(seededPhotoUrl('ad-1', 2)).toBe(seededPhotoUrl('ad-1', 2));
  });

  it('gives the same index on two different ads different photos', () => {
    // The old seed drew from 11 URLs at random, so every ad looked like one of
    // 11 rooms. This is what makes a seeded listing read as a listing.
    expect(seededPhotoUrl('ad-1', 0)).not.toBe(seededPhotoUrl('ad-2', 0));
  });

  it('gives one ad different photos at different indexes', () => {
    expect(seededPhotoUrl('ad-1', 0)).not.toBe(seededPhotoUrl('ad-1', 1));
  });

  /**
   * The uniqueness that actually matters, asserted over a real generated set
   * rather than two hand-picked calls. 380 rows previously shared 11 URLs; a
   * collision rule that held for index 0 and 1 but not at 30 would pass the
   * cases above.
   *
   * Ids are attached here because `buildSeedAds` does not set `id` -- Postgres
   * fills it in, and `seed.tsx` reads it back from `.returning()`. Passing the
   * builders' own output straight through is what surfaced the `undefined` hole
   * below, so the shape is modelled rather than assumed.
   */
  it('yields a distinct URL for every row of a realistic seed', () => {
    const ads = buildSeedAds(SAMPLE).map((ad, index) => ({
      ...ad,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));

    const urls = buildSeedImages(ads).map((row) => row.url);

    expect(urls.length).toBeGreaterThan(SAMPLE);
    expect(new Set(urls).size).toBe(urls.length);
  });

  /**
   * The hole that test found. An ad with no id produced
   * `.../seed/mampokoj-undefined-0/800/600` for every listing -- a clean run,
   * an exit code of 0, and 100 identical cards.
   */
  it('refuses an ad with no id rather than silently sharing one photo', () => {
    expect(() => seededPhotoUrl(undefined as unknown as string, 0)).toThrow(
      /real ad id/
    );
  });

  it('refuses an empty ad id too', () => {
    expect(() => seededPhotoUrl('', 0)).toThrow(/real ad id/);
  });

  it('stays within the 512-char limit on the url column', () => {
    const url = seededPhotoUrl(
      '00000000-0000-0000-0000-000000000000',
      9999
    );

    expect(url.length).toBeLessThanOrEqual(512);
  });

  it('uses only characters that are safe in a URL path', () => {
    // The ad id is a uuid, so this holds by construction -- which is worth a
    // test because it is the assumption that keeps the URL parseable. A city
    // name or a title here would produce a path needing encoding.
    expect(seededPhotoUrl(IMAGE_FIXTURE[0]!.id, 0)).toMatch(
      /^https:\/\/picsum\.photos\/seed\/[A-Za-z0-9_-]+\/800\/600$/
    );
  });
});