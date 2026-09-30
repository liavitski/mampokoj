import 'dotenv/config';
import { db } from '@/server/db';
import { ads, images } from '@/server/db/schema';
import { buildSeedAds, buildSeedImages } from './seed-data';

const ITEMS = 100;

async function seed() {
  const insertedAds = await db.insert(ads).values(buildSeedAds(ITEMS)).returning();
  const seedImages = buildSeedImages(insertedAds);

  if (seedImages.length > 0) {
    await db.insert(images).values(seedImages);
  }

  console.log(
    `Seeded ${insertedAds.length} ads and ${seedImages.length} images`
  );
}

/**
 * `catch (console.error)` alone would print the failure and exit 0, so a
 * broken seed looked like a clean run. A non-zero exit lets `pnpm db:seed` be
 * chained, and stops CI or a setup script from carrying on without its data.
 */
seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});