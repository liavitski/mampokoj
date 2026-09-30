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

const photoUrls = [
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7AV5yxCqjh0HeMT1kISRYFiyw7bEWGCZcPgpV',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ73Q7yVHJfdAiEXCa4JRuY79qQlWGDe6ZkPw1m',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ70GhZ2Dfo4TSz5NFkUgCeLRZ2yB8KsnMWxq9f',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ79tf8k8SpUD2m5kinJXFqcGTw6bloRj4ZEeLv',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ76rhbwpifg0Ye7VOGLWqo1DkuElc5bwB4MhTZ',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ78LN8Lft4bKNr9EiIPVmAJFfjDnBatCy3qZv1',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7yzqyuBeQ7wnRC6uEJ8WU90VZqtg1AMF5Ks3H',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7Q1FKMRXUAsJ40TzQ5y6CEnIOoMXw8vprPqYt',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7RIXzfsk4jPa5oHiqts6hQYJc29fzIGmdCxew',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7AOHusiqjh0HeMT1kISRYFiyw7bEWGCZcPgpV',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7eZkcu7AGLqXa9sEponcvf8tdVzDB0HxQgKir',
];

/**
 * `fileKey` is what `deletePhotoByFileKey` hands to UploadThing, and the column
 * is UNIQUE.
 *
 * It cannot be derived from the photo URL: there are only `photoUrls.length`
 * real files to point at, an ad may hold several photos, and a seed writes far
 * more rows than that -- so a real key would collide on the unique index and
 * take the whole image insert down with it. Nor can the same real key be
 * reused across ads, because deleting one would strip the file out from under
 * all the others.
 *
 * So seeded photos get a synthetic key, shaped to pass the
 * `fileKeySchema` check in `deletePhoto.tsx` and prefixed so it is obvious in
 * the database that no such file exists. Deleting one reports "Could not
 * delete the photo" and leaves the row in place, which is the intended
 * outcome: `deletePhotoByFileKey` only removes the row once UploadThing has
 * confirmed the delete.
 */
function seededFileKey(): string {
  return `seeded-${faker.string.uuid()}`;
}

function randomPhotoUrl(): string {
  return photoUrls[Math.floor(Math.random() * photoUrls.length)] as string;
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

    return Array.from({ length: imageCount }).map(() => ({
      adId: ad.id,
      url: randomPhotoUrl(),
      fileKey: seededFileKey(),
    }));
  });
}