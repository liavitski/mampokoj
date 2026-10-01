/**
 * Works out what has drifted between the UploadThing bucket and the database.
 *
 * The two cannot be kept in step transactionally. An upload is stored and billed
 * by UploadThing before `onUploadComplete` writes the row, and a delete removes
 * the file before the row, so every failure leaves one side pointing at nothing.
 * This module is the pure half of the repair: given what each side holds, it
 * decides what is safe to do about it.
 *
 * Kept free of `server-only`, of the database and of the UploadThing SDK so the
 * rules can be tested without either. `storage-reconcile.tsx` does the I/O.
 */

export type BucketFile = {
  key: string;
  /** UploadThing's own state: 'Uploaded', 'Uploading', 'Failed', 'Deletion Pending'. */
  status: string;
  uploadedAt: number;
};

export type ImageRow = {
  id: string;
  fileKey: string;
  adId: string;
};

/**
 * Keys written by `pnpm db:seed`, which point at real photo URLs under a
 * synthetic key.
 *
 * They are billed to nobody and are meant to be deleted, so they are drift to
 * be cleaned, not rows to be preserved -- but they are also the one class of
 * image row that is *expected* to have no file in the bucket. Development and
 * production share a database in this repository, so treating a missing file as
 * proof the row should go would delete a hundred generated listings' worth of
 * rows on the next run.
 */
const SEEDED_KEY_PREFIX = 'seeded-';

export function isSeededKey(fileKey: string): boolean {
  return fileKey.startsWith(SEEDED_KEY_PREFIX);
}

export type ReconcilePlan = {
  /**
   * Files in the bucket that no image row references. Safe to delete: nothing
   * can render them, and both delete flows work from `images.fileKey` so no
   * user action will ever reach them either.
   */
  orphans: BucketFile[];
  /**
   * Rows whose file is not in the bucket. These render as broken images.
   *
   * Reported, never deleted. A missing file is not proof the row is unwanted --
   * a deleted ad's rows, a seeded row, and a row whose file UploadThing has
   * already dropped mid-delete all look identical from here. Deleting a row
   * destroys user data; leaving one costs a broken thumbnail.
   */
  dangling: ImageRow[];
  /** Rows the seed wrote, counted separately because they always look dangling. */
  seededRows: ImageRow[];
  /** Bucket and database agree on this many rows. */
  matched: number;
};

export type PlanInput = {
  bucketFiles: BucketFile[];
  imageRows: ImageRow[];
  /**
   * A file still 'Uploading' has not finished being written, and UploadThing
   * may yet finish or roll it back on its own. Treating it as an orphan would
   * delete a file out from under an in-flight upload.
   */
  settledStatuses?: readonly string[];
};

const DEFAULT_SETTLED_STATUSES = ['Uploaded'] as const;

/**
 * Files that are finished being uploaded and can be judged on.
 *
 * 'Deletion Pending' is excluded deliberately: those are files this project
 * already asked to delete, and the row they belong to is either gone or on its
 * way out. Acting on them again would be working on a problem already in flight.
 */
export function settledFiles(
  files: readonly BucketFile[],
  statuses: readonly string[] = DEFAULT_SETTLED_STATUSES
): BucketFile[] {
  const settled = new Set(statuses);

  return files.filter((file) => settled.has(file.status));
}

export function planReconcile({
  bucketFiles,
  imageRows,
  settledStatuses,
}: PlanInput): ReconcilePlan {
  const referencedKeys = new Set(imageRows.map((row) => row.fileKey));

  const settled = settledFiles(bucketFiles, settledStatuses);
  const orphans = settled.filter((file) => !referencedKeys.has(file.key));

  const bucketKeys = new Set(bucketFiles.map((file) => file.key));
  const dangling = imageRows.filter((row) => !bucketKeys.has(row.fileKey));
  const seededRows = dangling.filter((row) => isSeededKey(row.fileKey));

  return {
    orphans,
    dangling: dangling.filter((row) => !isSeededKey(row.fileKey)),
    seededRows,
    matched: imageRows.length - dangling.length,
  };
}

export type PlanSummary = {
  orphans: number;
  dangling: number;
  seededRows: number;
  matched: number;
  /** Total bytes the orphans are costing, as UploadThing reports it. */
  orphanBytes: number;
};

/**
 * A count and a byte total, not a byte total alone.
 *
 * `listFiles` does not return a size, so `orphanBytes` is only populated by the
 * caller when it has one; a zero there means "unknown", and the summary says so
 * rather than implying the orphans are free.
 */
export function summarizePlan(
  plan: ReconcilePlan,
  sizes: ReadonlyMap<string, number> = new Map()
): PlanSummary {
  return {
    orphans: plan.orphans.length,
    dangling: plan.dangling.length,
    seededRows: plan.seededRows.length,
    matched: plan.matched,
    orphanBytes: plan.orphans.reduce(
      (total, file) => total + (sizes.get(file.key) ?? 0),
      0
    ),
  };
}
