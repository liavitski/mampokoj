// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';

import { ads, images } from '@/server/db/schema';

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
      expect(readMigrationSql(entry.tag), `missing ${entry.tag}.sql`).toContain(
        'CREATE'
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