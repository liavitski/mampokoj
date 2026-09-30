import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { neon } from '@neondatabase/serverless';

/**
 * Records the initial migration as already applied, without running it.
 *
 * Dev and production both received their schema through `db:push`, by hand, and
 * neither has a row in `drizzle.__drizzle_migrations`. A plain `db:migrate`
 * against them would therefore try to `CREATE TABLE "mampokoj_ads"` and fail,
 * because the table is already there -- leaving the database with migration
 * history that claims nothing ran while the schema is in fact fully present.
 *
 * This writes the bookkeeping row that `db:migrate` would have written, so the
 * baseline is treated as done and every *subsequent* migration applies normally.
 * It is the standard step for adopting migrations on a database that predates
 * them.
 *
 * Run once per database:
 *
 *   pnpm db:baseline   # existing database, schema already present
 *   pnpm db:migrate    # every database from now on, and every fresh one
 *
 * Never on a database that does not already have the schema -- that is what
 * `--force` exists for, and it is refused below unless given explicitly.
 */

const MIGRATIONS_FOLDER = 'drizzle';
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

/**
 * Fixed identifiers, inlined rather than passed as parameters.
 *
 * A prepared-statement placeholder cannot name a schema or a table, so these
 * two have to be literals. They are constants in this file and never derive
 * from input, which is the only reason inlining is safe here -- `created_at`
 * and `hash` are still bound properly below.
 */
const MIGRATIONS_TABLE_REF = `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`;

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

function readJournal(): JournalEntry[] {
  const path = `${MIGRATIONS_FOLDER}/meta/_journal.json`;
  return JSON.parse(readFileSync(path, 'utf8')).entries as JournalEntry[];
}

/**
 * The tables the baseline is supposed to have created.
 *
 * Checked rather than assumed, because the failure this guards against is
 * silent: baselining an empty database makes `db:migrate` believe the schema
 * exists, and every later migration then fails against tables that were never
 * there. That is much harder to diagnose than a refusal here.
 */
const EXPECTED_TABLES = ['mampokoj_ads', 'mampokoj_images'] as const;

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is missing');
  }

  const sql = neon(url);
  const force = process.argv.includes('--force');

  // `= ANY($1)` is not usable here: the neon HTTP driver sends bound values as
  // text, so Postgres reads an array parameter as a malformed array literal.
  // Comparing per table is not worth the complexity for two names, and `name`
  // is a bound value so this stays injection-safe.
  const missing: string[] = [];

  for (const table of EXPECTED_TABLES) {
    const rows = (await sql`
      SELECT count(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `) as { n: number }[];
    if (rows[0]?.n !== 1) missing.push(table);
  }

  if (missing.length > 0) {
    if (!force) {
      throw new Error(
        `Refusing to baseline: ${missing.join(', ')} not found in this database.\n` +
          `Either point DATABASE_URL at a database that already has the schema, ` +
          `or pass --force if you are certain it is correct.`
      );
    }
    console.warn(`--force given; baselining without ${missing.join(', ')}`);
  }

  // DDL, via `sql.query`: the neon HTTP driver cannot bind identifiers, and a
  // prepared statement cannot name a schema or table in any case. The strings
  // interpolated here are the file's own constants, never input.
  await sql.query(`CREATE SCHEMA IF NOT EXISTS ${MIGRATIONS_SCHEMA}`);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_REF} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const journal = readJournal();
  let recorded = 0;

  for (const entry of journal) {
    // Same hash and timestamp the migrator itself would compute, so a later
    // `db:migrate` agrees this migration is done rather than replaying it.
    // readMigrationFiles hashes the file bytes, so this must not reformat it.
    const query = readFileSync(`${MIGRATIONS_FOLDER}/${entry.tag}.sql`, 'utf8');
    const hash = createHash('sha256').update(query).digest('hex');

    // `ON CONFLICT DO NOTHING` would be wrong here and did not work: the
    // migrations table has no unique constraint on (hash, created_at), so
    // Postgres has nothing to conflict on and inserts a duplicate row every
    // run. Guarding on what is already recorded is what actually makes this
    // idempotent -- verified by running it twice against a scratch database.
    const alreadyRecorded = await sql.query(
      `SELECT count(*)::int AS n
       FROM ${MIGRATIONS_TABLE_REF}
       WHERE "hash" = $1 AND "created_at" = $2`,
      [hash, entry.when]
    );

    if ((alreadyRecorded[0] as { n: number }).n > 0) continue;

    // Positional `$1`/`$2` through `query`, not the tagged template. The neon
    // HTTP tag turns *every* interpolation into a bind parameter, so a table
    // name passed that way produces `INSERT INTO $1` and a syntax error --
    // verified against the driver, not inferred. `query` is the form that
    // accepts positional values and a literal identifier in the same string.
    await sql.query(
      `INSERT INTO ${MIGRATIONS_TABLE_REF} ("hash", "created_at")
       VALUES ($1, $2)`,
      [hash, entry.when]
    );

    recorded += 1;
    console.log(`Recorded ${entry.tag} as applied`);
  }

  console.log(
    recorded === 0
      ? 'Nothing to baseline; migrations are already recorded'
      : `Baselined ${recorded} migration(s)`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});