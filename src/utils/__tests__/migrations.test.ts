// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import { ads, images } from '@/server/db/schema';
import { compileWhere } from '@/test/drizzle-where';

const MIGRATIONS_FOLDER = 'drizzle';

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

function readJournal(): JournalEntry[] {
  const path = join(MIGRATIONS_FOLDER, 'meta/_journal.json');
  return JSON.parse(readFileSync(path, 'utf8')).entries as JournalEntry[];
}

function readMigrationSql(tag: string): string {
  return readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), 'utf8');
}

/**
 * The tables and columns the schema declares.
 *
 * Derived from the Drizzle table objects rather than listed, so a column added
 * to the schema without a corresponding migration fails this test instead of
 * being discovered in production.
 */
const SCHEMA_TABLES = [ads, images].map((table) => {
  const config = getTableConfig(table);
  return {
    name: config.name,
    // On drizzle-orm 0.45 `columns` is an array of column configs, each
    // carrying its own name. `Object.keys` over it would yield indices, which
    // is a silent way to assert nothing.
    columns: config.columns.map((column) => column.name),
  };
});

describe('committed migrations', () => {
  const journal = readJournal();

  it('has a baseline migration', () => {
    // Without one, a fresh database would come up with no tables at all and
    // the first request would fail rather than at migration time.
    expect(journal.length).toBeGreaterThan(0);
  });

  it('every journal entry has a SQL file on disk', () => {
    for (const entry of journal) {
      // Non-empty, rather than `toContain('CREATE')`: the first two migrations
      // create tables, but 0003 is an ALTER TABLE only, and asserting CREATE
      // made this test about the *shape* of a migration rather than whether its
      // file exists. A column addition is a legitimate migration and must not
      // have to smuggle a CREATE in to pass.
      const sql = readMigrationSql(entry.tag);

      expect(sql.length, `missing or empty ${entry.tag}.sql`).toBeGreaterThan(0);
      expect(sql.trimEnd(), `${entry.tag}.sql ends in a statement separator`).toMatch(
        /;\s*$/
      );
    }
  });

  it('declares no migration file the journal does not list', () => {
    // drizzle replays the journal, so an unlisted file is dead weight that
    // will look like a missing migration to the next reader.
    const files = readdirSync(MIGRATIONS_FOLDER).filter((f) =>
      f.endsWith('.sql')
    );
    const listed = new Set(journal.map((e) => `${e.tag}.sql`));

    expect(files.sort()).toEqual([...listed].sort());
  });

  it('creates every table the schema declares', () => {
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    for (const { name } of SCHEMA_TABLES) {
      expect(allSql, `no migration creates ${name}`).toContain(
        `CREATE TABLE "${name}"`
      );
    }
  });

  it('creates every column the schema declares', () => {
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    for (const { name, columns } of SCHEMA_TABLES) {
      for (const column of columns) {
        expect(allSql, `no migration creates ${name}.${column}`).toContain(
          `"${column}"`
        );
      }
    }
  });

  it('declares the ad limit as a unique pair in the schema', () => {
    // On drizzle-orm 0.45 an index keeps its settings under a
    // `config` property the public typings do not expose, so the
    // shape is asserted through the same cast the columns above
    // warn about.
    const config = getTableConfig(ads);
    const slotIndex = config.indexes.find(
      (index) =>
        (index as unknown as {
          config: {
            name: string;
            unique: boolean;
            columns: { name: string }[];
          };
        }).config.name === 'mampokoj_ads_user_slot_unique'
    );

    // The slot index is what enforces MAX_ADS_PER_USER, so the
    // schema has to declare it as unique over exactly the pair
    // createAd inserts into. A non-unique or narrower index
    // here would put the limit back on a count read under a
    // lock, which is the race the slot exists to close.
    expect(slotIndex).toBeDefined();
    const { unique, columns } = (
      slotIndex as unknown as {
        config: { unique: boolean; columns: { name: string }[] };
      }
    ).config;

    expect(unique).toBe(true);
    expect(columns.map((column) => column.name)).toEqual([
      'userId',
      'slot',
    ]);
  });

  it('creates the unique index the ad limit runs on', () => {
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    // The index name and the pair it covers, so a migration that
    // creates the column without the constraint -- or covers a
    // different pair -- fails here rather than in production,
    // where it would surface as two ads too many.
    expect(allSql).toContain(
      'CREATE UNIQUE INDEX "mampokoj_ads_user_slot_unique"'
    );
    expect(allSql).toContain('("userId","slot")');
  });

  it('declares reportedAt in the schema as a nullable column with no default', () => {
    // First-report-wins is enforced in the write's own predicate
    // (`reportedAt IS NULL`), so the column has to be able to hold "nobody has
    // reported this" -- a default of now() would mark all 201 seeded ads as
    // reported the moment the migration landed, and a NOT NULL would make the
    // column impossible to leave unset.
    const config = getTableConfig(ads);
    const reportedAt = config.columns.find((column) => column.name === 'reportedAt');

    expect(reportedAt, 'schema has no reportedAt column').toBeDefined();
    expect(reportedAt!.notNull).toBe(false);
    expect(reportedAt!.hasDefault).toBe(false);
  });

  it('declares the moderation index in the schema as partial on reportedAt', () => {
    // A plain index over a column that is null on almost every row indexes
    // nothing useful and costs writes on every ad. The predicate is what makes
    // it an index of the queue rather than of the table, so a `.where()` dropped
    // from schema.ts has to fail here rather than degrade quietly.
    const config = getTableConfig(ads);
    const reportedIndex = config.indexes.find(
      (index) =>
        (index as unknown as { config: { name: string } }).config.name ===
        'mampokoj_ads_reported_idx'
    );

    expect(reportedIndex, 'schema declares no mampokoj_ads_reported_idx').toBeDefined();

    const indexConfig = (
      reportedIndex as unknown as {
        config: {
          unique: boolean;
          columns: { name: string }[];
          where: SQL | undefined;
        };
      }
    ).config;

    expect(indexConfig.columns.map((column) => column.name)).toEqual(['reportedAt']);
    // Non-unique: two reported ads must both be in the queue.
    expect(indexConfig.unique).toBe(false);
    expect(compileWhere(indexConfig.where).sql).toContain('"reportedAt" IS NOT NULL');
  });

  it('adds the reportedAt column in a migration, without a NOT NULL', () => {
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    // The ADD COLUMN and its nullability, rather than relying on the generic
    // "creates every column" check above -- that one only proves the word
    // "reportedAt" appears somewhere, which a dropped column in a later
    // migration would also satisfy.
    expect(allSql).toContain('ADD COLUMN "reportedAt"');
    expect(allSql).not.toMatch(/ADD COLUMN "reportedAt"[^;]*NOT NULL/);
  });

  it('creates the moderation index as partial, over reportedAt only', () => {
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    // The WHERE is asserted, not just the CREATE: without it the index is the
    // wrong shape but still satisfies the generic `toContain('CREATE')` check
    // above, so a non-partial index would pass unnoticed.
    expect(allSql).toContain('CREATE INDEX "mampokoj_ads_reported_idx"');
    expect(allSql).toContain('("reportedAt")');
    // Table-qualified, because that is what drizzle-kit emits for a partial
    // index and it is the unambiguous form. Asserted in full so a plain
    // (non-partial) index, or a predicate over some other column, fails here.
    expect(allSql).toContain(
      'WHERE "mampokoj_ads"."reportedAt" IS NOT NULL'
    );
  });

  it('declares checkedAt in the schema as a nullable column with no default', () => {
    // Same rule as reportedAt, and for a sharper reason. `checkedAt IS NULL` is
    // what keeps an ad reportable, so a default of now() would mark every
    // existing ad as reviewed by a moderator who has never seen it -- and a
    // NOT NULL would make the column impossible to leave unset, which is the
    // only state an un-reviewed ad is allowed to be in.
    const config = getTableConfig(ads);
    const checkedAt = config.columns.find((column) => column.name === 'checkedAt');

    expect(checkedAt, 'schema has no checkedAt column').toBeDefined();
    expect(checkedAt!.notNull).toBe(false);
    expect(checkedAt!.hasDefault).toBe(false);
  });

  it('adds the checkedAt column in a migration, without a NOT NULL', () => {
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    // The ADD COLUMN and its nullability, explicitly rather than relying on the
    // generic "creates every column" check -- that one only proves the word
    // "checkedAt" appears somewhere.
    expect(allSql).toContain('ADD COLUMN "checkedAt"');
    expect(allSql).not.toMatch(/ADD COLUMN "checkedAt"[^;]*NOT NULL/);
  });

  it('declares no index on checkedAt, because nothing orders by it', () => {
    // The only query that reads the column is the all-ads list, which orders by
    // (createdAt, id) and is served by mampokoj_ads_created_id_idx. An index
    // here would be written on every moderation click to serve a predicate that
    // no scan filters on -- and adding one is an "ask first" change in
    // HANDOFF.md §6, so it should have to be argued for, not defaulted into.
    const config = getTableConfig(ads);
    const names = config.indexes.map(
      (index) => (index as unknown as { config: { name: string } }).config.name
    );

    expect(names).not.toContain('mampokoj_ads_checked_idx');
  });

  it('has no migration that drops a table the schema still declares', () => {
    // A DROP in the migration history alongside a live CREATE means the two
    // have diverged, which is exactly the drift this folder exists to prevent.
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    for (const { name } of SCHEMA_TABLES) {
      expect(allSql, `a migration drops ${name}`).not.toContain(
        `DROP TABLE "${name}"`
      );
    }
  });

  it('stamps migrations in increasing order', () => {
    // The migrator picks the *last* row by created_at and replays anything
    // newer, so out-of-order stamps make it re-apply or skip a migration.
    const stamps = journal.map((e) => e.when);

    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('leaves the foreign key cascade that deletes images with an ad', () => {
    // `deleteAd` relies on it; a migration that dropped the constraint would
    // turn every ad deletion into orphaned image rows.
    const allSql = journal.map((e) => readMigrationSql(e.tag)).join('\n');

    expect(allSql).toContain('ON DELETE cascade');
  });
});