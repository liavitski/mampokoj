// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  isSeededKey,
  planReconcile,
  settledFiles,
  summarizePlan,
} from '../storage-reconcile-plan';

const AD_ID = '11111111-1111-4111-8111-111111111111';

function uploaded(key: string) {
  return { key, status: 'Uploaded', uploadedAt: 1_700_000_000_000 };
}

function row(fileKey: string, id = 'image-1') {
  return { id, fileKey, adId: AD_ID };
}

describe('planReconcile', () => {
  it('flags a bucket file that no image row references', () => {
    // The orphan a failed attach leaves behind. Nothing renders it and no user
    // action can reach it, because both delete flows resolve through
    // images.fileKey.
    const plan = planReconcile({
      bucketFiles: [uploaded('live-key'), uploaded('orphan-key')],
      imageRows: [row('live-key')],
    });

    expect(plan.orphans.map((file) => file.key)).toEqual(['orphan-key']);
    expect(plan.matched).toBe(1);
  });

  it('flags a row whose file is gone from the bucket', () => {
    // The drift left when `deleteFiles` succeeded and the row delete did not.
    const plan = planReconcile({
      bucketFiles: [],
      imageRows: [row('gone-key')],
    });

    expect(plan.dangling.map((r) => r.fileKey)).toEqual(['gone-key']);
  });

  it('never proposes deleting a dangling row', () => {
    // The dangerous direction. A missing file does not prove the row is
    // unwanted, and deleting one destroys user data, whereas leaving one costs
    // a broken thumbnail.
    const plan = planReconcile({ bucketFiles: [], imageRows: [row('gone-key')] });

    expect(plan.orphans).toEqual([]);
  });

  it('counts seeded rows separately, because they always look dangling', () => {
    // Seeded rows carry synthetic keys pointing at real photo URLs, so they
    // never exist in the bucket. Development and production share a database
    // here, so folding these into `dangling` would report a hundred fake rows
    // as real damage on every run.
    const plan = planReconcile({
      bucketFiles: [],
      imageRows: [row('seeded-abc'), row('real-gone')],
    });

    expect(plan.seededRows.map((r) => r.fileKey)).toEqual(['seeded-abc']);
    expect(plan.dangling.map((r) => r.fileKey)).toEqual(['real-gone']);
  });

  it('finds nothing to do when both sides agree', () => {
    const plan = planReconcile({
      bucketFiles: [uploaded('a'), uploaded('b')],
      imageRows: [row('a'), row('b', 'image-2')],
    });

    expect(plan.orphans).toEqual([]);
    expect(plan.dangling).toEqual([]);
    expect(plan.matched).toBe(2);
  });

  it('handles an ad with no photos and an empty bucket', () => {
    const plan = planReconcile({ bucketFiles: [], imageRows: [] });

    expect(plan.orphans).toEqual([]);
    expect(plan.dangling).toEqual([]);
    expect(plan.matched).toBe(0);
  });
});

describe('settledFiles', () => {
  it('leaves an in-flight upload alone', () => {
    // A file still uploading has not finished being written; UploadThing may
    // yet finish or roll it back. Deleting it would pull the file out from
    // under a live upload whose row is about to be inserted.
    const files = [
      uploaded('done'),
      { key: 'inflight', status: 'Uploading', uploadedAt: 1 },
    ];

    expect(settledFiles(files).map((f) => f.key)).toEqual(['done']);
  });

  it('leaves a file already pending deletion alone', () => {
    // Those are files this project has already asked UploadThing to remove.
    // Acting again would work on a problem already in flight.
    const files = [
      uploaded('kept'),
      { key: 'going', status: 'Deletion Pending', uploadedAt: 1 },
    ];

    expect(settledFiles(files).map((f) => f.key)).toEqual(['kept']);
  });

  it('leaves a failed upload alone', () => {
    // 'Failed' may be retried by UploadThing's own recovery, and it was never
    // a file this project's rows referenced.
    const files = [uploaded('kept'), { key: 'bad', status: 'Failed', uploadedAt: 1 }];

    expect(settledFiles(files).map((f) => f.key)).toEqual(['kept']);
  });
});

describe('summarizePlan', () => {
  it('totals the bytes the orphans are costing', () => {
    const plan = planReconcile({
      bucketFiles: [uploaded('a'), uploaded('b')],
      imageRows: [],
    });

    const summary = summarizePlan(
      plan,
      new Map([
        ['a', 2048],
        ['b', 1024],
      ])
    );

    expect(summary).toEqual({
      orphans: 2,
      dangling: 0,
      seededRows: 0,
      matched: 0,
      orphanBytes: 3072,
    });
  });

  it('reports zero bytes rather than implying orphans are free, when sizes are unknown', () => {
    const plan = planReconcile({ bucketFiles: [uploaded('a')], imageRows: [] });

    expect(summarizePlan(plan).orphanBytes).toBe(0);
  });
});

describe('isSeededKey', () => {
  it('recognises a key the seed wrote', () => {
    expect(isSeededKey('seeded-0f4e2a')).toBe(true);
  });

  it('does not treat a real key as seeded', () => {
    expect(isSeededKey('kpgjANcHnEQ79tf8k8SpUD2m5kinJXFqcGTw6bloRj4ZEeLv')).toBe(
      false
    );
  });
});
