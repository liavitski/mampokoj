import 'dotenv/config';
import { db } from '@/server/db';
import { ads, images } from '@/server/db/schema';
import { assessSeedTarget, describeSeedTarget, SeedRefusal } from './seed-guard';
import { buildSeedAds, buildSeedImages } from './seed-data';

const ITEMS = 100;

/**
 * Fills a database with generated listings.
 *
 * The guard is the first thing that runs, before a single row is written. It
 * names the database rather than trusting `DATABASE_URL`: the failure this
 * prevents is `pnpm db:seed` quietly writing a hundred fake listings to
 * production because the two environments shared a connection string, which is
 * exactly how this repository ended up serving generated data.
 *
 * Print the target even when allowed. A seed that writes a hundred rows should
 * never be a surprise, and the name is the only part a human needs.
 */
async function seed() {
  const verdict = assessSeedTarget(process.env.DATABASE_URL, process.env.SEED_ALLOW);

  if (!verdict.ok) {
    throw new SeedRefusal(verdict.reason);
  }

  console.log(`Seeding ${describeSeedTarget(verdict.target)} ...`);

  const insertedAds = await db.insert(ads).values(buildSeedAds(ITEMS)).returning();
  const seedImages = buildSeedImages(insertedAds);

  if (seedImages.length > 0) {
    await db.insert(images).values(seedImages);
  }

  console.log(
    `Seeded ${insertedAds.length} ads and ${seedImages.length} images into ${describeSeedTarget(verdict.target)}`
  );
}

/**
 * `catch (console.error)` alone would print the failure and exit 0, so a
 * broken seed looked like a clean run. A non-zero exit lets `pnpm db:seed` be
 * chained, and stops CI or a setup script from carrying on without its data.
 *
 * A guard refusal prints only its message. It is a decision, not a crash, and a
 * stack trace pointing into the seed script just buries the one line that says
 * what to do about it.
 */
seed().catch((error) => {
  if (error instanceof SeedRefusal) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});