import 'dotenv/config';
import { db } from '@/server/db';
import { ads, images } from '@/server/db/schema';
import { fakerCS_CZ as faker } from '@faker-js/faker';
import type { InferInsertModel } from 'drizzle-orm';
import { CZ_REGIONS, CZ_CITIES } from '@/constants';

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

const photosUrls = [
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

function getRandomPhotoUrl() {
  return photosUrls[Math.floor(Math.random() * photosUrls.length)];
}

const getRandomCityByRegion = (regionCode: string) => {
  const cities = CZ_CITIES.filter((c) => c.region === regionCode);

  if (cities.length === 0) return undefined;

  return cities[Math.floor(Math.random() * cities.length)]?.name;
};

async function seed() {
  const ITEMS = 100;
  const ARR_OF_REGION_CODES = CZ_REGIONS.map((region) => region.code);

  type NewAd = InferInsertModel<typeof ads>;
  type NewImage = InferInsertModel<typeof images>;

  const data: NewAd[] = Array.from({ length: ITEMS }).map((_, i) => {
    const region =
      ARR_OF_REGION_CODES[
        Math.floor(Math.random() * ARR_OF_REGION_CODES.length)
      ]!;

    const city =
      getRandomCityByRegion(region) ?? faker.location.city();

    return {
      userId: faker.string.uuid(),
      title: faker.helpers.arrayElement(czechTitles),
      price: faker.number
        .float({ min: 6000, max: 16000, fractionDigits: 2 })
        .toString(),
      city,
      region,
      availableFrom: faker.date.future(),
      description: faker.helpers.arrayElement(czechDescriptions),
      contactPhone: faker.phone.number(),
      createdAt: new Date(Date.now() - i * 1000 * 60),
    };
  });

  // 1. Insert ads and return inserted rows
  const insertedAds = await db.insert(ads).values(data).returning();

  // 2. Generate images
  const imagesData: NewImage[] = insertedAds.flatMap((ad) => {
    const imageCount = faker.number.int({ min: 1, max: 3 });

    return Array.from({ length: imageCount }).map(() => ({
      userId: ad.userId,
      adId: ad.id,
      fileKey: faker.string.uuid(),
      url: getRandomPhotoUrl(),
    }));
  });

  // 3. Insert images
  await db.insert(images).values(imagesData);

  console.log('Seeded ads + images');
}

seed().catch(console.error);
