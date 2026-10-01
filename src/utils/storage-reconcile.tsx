import 'dotenv/config';

import { db } from '@/server/db';
import { utapi } from '@/server/storage';
import {
  planReconcile,
  summarizePlan,
  type BucketFile,
  type ImageRow,
} from './storage-reconcile-plan';

/**
 * Repairs drift between the UploadThing bucket and the database.
 *
 * The two cannot be kept in step transactionally. UploadThing stores and bills a
 * file before `onUploadComplete` writes its row; a delete removes the file
 * before the row. So every failure -- a crash, an outage, a rate limit -- leaves
 * one side pointing at nothing, and neither delete flow can see the gap because
 * both work from `images.fileKey`.
 *
 *   pnpm storage:reconcile            # report only, changes nothing
 *   pnpm storage:reconcile --delete   # delete the orphans
 *
 * Dry run by default. This deletes real files that cost real money, and the
 * person running it is the only thing standing between a mis-set flag and a
 * bucket emptied by a bad query.
 *
 * Only orphans are ever deleted, and a dangling row is only ever reported. See
 * `storage-reconcile-plan.ts` for why that asymmetry is deliberate.
 */

const PAGE_SIZE = 500;

/** `listFiles` is paginated; a partial read would look like a bucket of orphans. */
async function readWholeBucket(): Promise<BucketFile[]> {
  const files: BucketFile[] = [];
  let offset = 0;

  for (;;) {
    const page = await utapi.listFiles({ limit: PAGE_SIZE, offset });

    files.push(
      ...page.files.map((file) => ({
        key: file.key,
        status: file.status,
        uploadedAt: file.uploadedAt,
      }))
    );

    if (!page.hasMore) return files;

    offset += page.files.length;

    // A bucket that reports another page while returning nothing would loop
    // forever on a zero-length offset.
    if (page.files.length === 0) {
      throw new Error('UploadThing reported more files but returned none');
    }
  }
}

async function readImageRows(): Promise<ImageRow[]> {
  const rows = await db.query.images.findMany({
    columns: { id: true, fileKey: true, adId: true },
  });

  return rows;
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  console.log('Reading the upload bucket and the image table ...');

  const [bucketFiles, imageRows] = await Promise.all([
    readWholeBucket(),
    readImageRows(),
  ]);

  const plan = planReconcile({ bucketFiles, imageRows });
  const summary = summarizePlan(plan);

  console.log(
    `\nBucket: ${bucketFiles.length} file(s). Database: ${imageRows.length} row(s). ` +
      `${summary.matched} matched.`
  );

  for (const file of plan.orphans) {
    console.log(`  orphan    ${file.key}  (uploaded ${new Date(file.uploadedAt).toISOString()})`);
  }

  for (const row of plan.dangling) {
    console.log(`  dangling  ${row.fileKey}  (image ${row.id}, ad ${row.adId})`);
  }

  if (plan.seededRows.length > 0) {
    console.log(
      `  ${plan.seededRows.length} seeded row(s) have no file by design and are not drift.`
    );
  }

  if (summary.orphans === 0 && summary.dangling === 0) {
    console.log('\nNothing to reconcile.');
    return;
  }

  if (!shouldDelete) {
    console.log(
      `\n${summary.orphans} orphan file(s) would be deleted. ` +
        `Re-run with --delete to do it.\n` +
        `${summary.dangling} dangling row(s) are reported only: a missing file is not ` +
        `proof the row is unwanted, and removing one would destroy user data. ` +
        `Remove them by hand once you know why they are there.`
    );
    return;
  }

  if (summary.dangling > 0) {
    console.log(
      `\nLeaving ${summary.dangling} dangling row(s) in place. They need a human decision.`
    );
  }

  if (summary.orphans > 0) {
    // One call for the whole set. Deleting them individually would be a request
    // per file, and a partial failure halfway through is harder to reason about
    // than one call that reports what it removed.
    const keys = plan.orphans.map((file) => file.key);

    console.log(`\nDeleting ${keys.length} orphan file(s) ...`);

    const result = await utapi.deleteFiles(keys);

    console.log(
      result.success
        ? `Deleted ${result.deletedCount} file(s).`
        : `UploadThing reported the delete did not succeed (${result.deletedCount} removed). Re-run to see what is left.`
    );
  }
}

main().catch((error) => {
  // A non-zero exit, so a cron or CI step carrying on past a failed repair
  // notices. See the comment on `seed.tsx`'s handler for the same reasoning.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
