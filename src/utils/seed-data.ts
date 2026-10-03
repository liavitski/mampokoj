import { fakerCS_CZ as faker } from '@faker-js/faker';
import type { InferInsertModel } from 'drizzle-orm';

import { CZ_CITIES, CZ_REGIONS } from '@/constants';
import { ads, images } from '@/server/db/schema';

export type NewAd = InferInsertModel<typeof ads>;
export type NewImage = InferInsertModel<typeof images>;

const czechDescriptions = [
  'Nabízím k pronájmu světlý pokoj v klidné lokalitě s dobrou dostupností do centra.',
  'K pronájmu útulný pokoj v bytě 2+1, plně vybavený a připravený k nastěhování.',
  'Pronájem pokoje v moderním bytě, blízko MHD a veškeré občanské vybavenosti.',
  'Volný pokoj v prostorném bytě, vhodný pro jednotlivce nebo studenta.',
  'Nabízím pokoj k pronájmu v centru města, vše v docházkové vzdálenosti.',
  'Světlý pokoj v rekonstruovaném bytě s výbornou dostupností a klidným prostředím.',
  'K dispozici pokoj v bytě sdíleném s mladými pracujícími, přátelská atmosféra.',
  'Pronájem zařízeného pokoje v bytě 3+kk, ihned k nastěhování.',
  'Nabízím dlouhodobý pronájem pokoje v klidné části města.',
  'Pokoj k pronájmu v bytě s balkonem, ideální pro studenty.',
  'Volný pokoj v moderním bytě s novým vybavením a rychlým internetem.',
  'K pronájmu pokoj v blízkosti univerzity, vhodné pro studenty.',
  'Světlý a prostorný pokoj v bytě po rekonstrukci.',
  'Nabízím pokoj v bytě s výbornou dopravní dostupností.',
  'Pronájem pokoje v tiché lokalitě s možností parkování.',
  'K dispozici pokoj v bytě sdíleném s jedním spolubydlícím.',
  'Útulný pokoj v bytě s kompletním vybavením kuchyně.',
  'Nabízím pokoj v novostavbě s moderním interiérem.',
  'Pokoj k pronájmu v bytě blízko centra a parků.',
  'Volný pokoj v bytě s přátelskou atmosférou a klidným prostředím.',
  'Pronájem pokoje v bytě s dobrou dostupností MHD.',
  'Světlý pokoj v bytě s balkonem a krásným výhledem.',
  'Nabízím pokoj v bytě s novým nábytkem a vybavením.',
  'K pronájmu pokoj v bytě v klidné rezidenční oblasti.',
  'Pokoj v bytě s rychlým internetem a plně vybavenou kuchyní.',
  'Volný pokoj v bytě sdíleném s mladými lidmi.',
  'Pronájem pokoje v moderním bytě s výtahem.',
  'Nabízím pokoj v bytě s dobrou občanskou vybaveností v okolí.',
  'Útulný pokoj v bytě s přístupem na balkon.',
  'K dispozici pokoj v bytě s výbornou dostupností do centra města.',
];

const czechTitles = [
  'Pokoj k pronájmu v klidném bytě',
  'Světlý pokoj k pronájmu',
  'Útulný pokoj v bytě 2+1',
  'Zařízený pokoj k pronájmu',
  'Volný pokoj ihned k nastěhování',
  'Pokoj v moderním bytě',
  'Pronájem pokoje v bytě s balkonem',
  'Samostatný pokoj k pronájmu',
  'Pokoj v bytě po rekonstrukci',
  'Levný pokoj k pronájmu',
  'Pokoj v bytě se spolubydlícími',
  'Prostorný pokoj k pronájmu',
  'Pokoj v bytě s dobrou dostupností',
  'Krátkodobý pronájem pokoje',
  'Dlouhodobý pronájem pokoje',
  'Pokoj v bytě s vybavenou kuchyní',
  'Pokoj pro studenta k pronájmu',
  'Pokoj v klidné domácnosti',
  'Pokoj v bytě s internetem',
  'Pronájem pokoje v novostavbě',
  'Pokoj v bytě s výtahem',
  'Pokoj v bytě s přátelskou atmosférou',
  'Menší pokoj k pronájmu',
  'Velký pokoj v bytě',
  'Pokoj v bytě s balkonem',
  'Pokoj v bytě se sdílenou koupelnou',
  'Pokoj v bytě s kompletním vybavením',
  'Pokoj v bytě vhodný pro jednotlivce',
  'Pokoj k pronájmu v bytě 3+kk',
  'Pokoj v bytě ihned volný',
];

/**
 * The photo URL for one seeded image.
 *
 * **Derived, not drawn from a list of real files.** The seed used to hardcode
 * 11 `gtiivfj57h.ufs.sh` URLs -- real uploads from this project's own bucket,
 * since deleted -- and pick one at random. Every one of them 404s, so every
 * seeded card rendered a broken thumbnail and every seeded ad's share card and
 * JSON-LD pointed at a dead image. Measured, not assumed: all 11 answered 404
 * by GET, and the table held 380 rows across those 11 URLs.
 *
 * `picsum.photos/seed/<key>` serves a real JPEG chosen deterministically from
 * the key, so the same ad always gets the same photos -- which is what makes a
 * seeded listing look like a listing rather than like a lottery, and what lets
 * `db:seed` be re-run without reshuffling the grid. Verified stable across
 * repeated fetches of one key, and distinct across keys.
 *
 * The hostname is already in `next.config.ts`'s `remotePatterns`, so this needs
 * no config change; before this it was allowlisted and unused, which is the
 * kind of thing that looks like a decision and is actually a leftover.
 *
 * **It is a third-party fetch at view time**, mitigated by `next/image` caching
 * the optimised result, and it is the honest trade against the alternative --
 * there is no set of room photographs in this repository, and a committed
 * placeholder would be a rectangle pretending to be a room.
 *
 * The photo is *not* in UploadThing, which is why `fileKey` below is synthetic
 * and why `storage:reconcile` reports these rows separately instead of as
 * drift.
 */
export function seededPhotoUrl(adId: string, index: number): string {
  /**
   * Throws rather than interpolating whatever it was handed. Without this, an
   * `undefined` ad id produces
   * `.../seed/mampokoj-undefined-0/800/600` for every ad in the seed -- a
   * successful run that gives all 100 listings the same single photograph, with
   * no error anywhere. Found by the uniqueness test in `seed-data.test.ts`,
   * which passed a list of ads straight from `buildSeedAds` (whose `id` is
   * filled in by Postgres, so it is undefined until insert) and got 3 distinct
   * URLs across 188 rows.
   *
   * `seed.tsx` inserts the ads and passes `.returning()`, so real ids are
   * always present in the one caller that matters. This is here so that if that
   * ever stops being true, the seed says so instead of quietly producing a grid
   * of identical cards.
   */
  if (!adId) {
    throw new Error(
      'seededPhotoUrl needs a real ad id: it is the seed the photo is chosen from, so without it every ad gets the same photo'
    );
  }

  return `https://picsum.photos/seed/mampokoj-${adId}-${index}/800/600`;
}

/**
 * `fileKey` is what `deletePhotoByFileKey` hands to UploadThing, and the column
 * is UNIQUE.
 *
 * It cannot be a real key. Nothing seeded is in the bucket -- the photo URL is
 * a `picsum` address -- so there is no file to name, and a repeated real key
 * would collide on the unique index and take the whole image insert down with
 * it. Nor could one real key be reused across rows, because deleting one would
 * strip the file out from under all the others.
 *
 * So seeded photos get a synthetic key, shaped to pass the `fileKeySchema`
 * check in `deletePhoto.tsx` and prefixed so it is obvious in the database that
 * no such file exists. Deleting one reports "Could not delete the photo" and
 * leaves the row in place, which is the intended outcome:
 * `deletePhotoByFileKey` only removes the row once UploadThing has confirmed
 * the delete. `storage:reconcile-plan.ts` keys off this same prefix to keep
 * these rows out of the drift report, so the two must not drift apart.
 */
function seededFileKey(): string {
  return `seeded-${faker.string.uuid()}`;
}

function randomCityInRegion(regionCode: string): string {
  const cities = CZ_CITIES.filter((city) => city.region === regionCode);

  // Every region has at least one city in CZ_CITIES, so this is a guard
  // against the constants drifting apart rather than a real branch.
  if (cities.length === 0) throw new Error(`No city for region ${regionCode}`);

  return (cities[Math.floor(Math.random() * cities.length)] as { name: string })
    .name;
}

/**
 * A Czech number in the shape `formatCZPhone` and `adInputSchema` agree on:
 * nine digits behind the `+420` country code, so it survives a round trip
 * through the edit form. `faker.phone.number()` produced `(774) 128-456`
 * instead, which the ad cards rendered verbatim.
 */
function randomCzechPhone(): string {
  const digits = Array.from({ length: 9 }, () =>
    Math.floor(Math.random() * 10)
  ).join('');

  return `+420${digits}`;
}

/**
 * `availableFrom` is a calendar date that the schema anchors at UTC midnight.
 * `faker.date.future()` returns an arbitrary instant, so an edit round trip
 * shifted seeded ads by a day for anyone not on UTC.
 */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * Builds the ad rows. `createdAt` is staggered a minute apart so the listing
 * order is a total order and pagination by `(createdAt, id)` cannot tie.
 */
export function buildSeedAds(count: number): NewAd[] {
  const regionCodes = CZ_REGIONS.map((region) => region.code);

  return Array.from({ length: count }, (_, i) => {
    const region =
      regionCodes[Math.floor(Math.random() * regionCodes.length)] as string;

    return {
      userId: faker.string.uuid(),
      title: faker.helpers.arrayElement(czechTitles),
      // numeric(10, 2): ten digits total, two of them after the point.
      price: faker.number
        .float({ min: 6000, max: 16000, fractionDigits: 2 })
        .toFixed(2),
      city: randomCityInRegion(region),
      region,
      availableFrom: utcMidnight(faker.date.future()),
      description: faker.helpers.arrayElement(czechDescriptions),
      contactPhone: randomCzechPhone(),
      createdAt: new Date(Date.now() - i * 60_000),
    };
  });
}

/**
 * Builds the image rows for already-inserted ads.
 *
 * There is deliberately no `userId` here: `images` has no such column and its
 * only link to a poster is `adId`. The previous version set one anyway and the
 * insert was rejected, so the script had never run.
 */
export function buildSeedImages(insertedAds: { id: string }[]): NewImage[] {
  return insertedAds.flatMap((ad) => {
    const imageCount = faker.number.int({ min: 1, max: 3 });

    // `index` rather than a random draw, so an ad's photos are a stable set
    // keyed to that ad -- see `seededPhotoUrl`. `map`'s index is the only
    // ordering that both `buildSeedImages` and the repair script below can
    // agree on, which is why it is not randomised.
    return Array.from({ length: imageCount }).map((_, index) => ({
      adId: ad.id,
      url: seededPhotoUrl(ad.id, index),
      fileKey: seededFileKey(),
    }));
  });
}