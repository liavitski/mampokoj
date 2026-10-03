/**
 * Decides whether a database may be seeded with fake data.
 *
 * `pnpm db:seed` inserts a hundred generated listings, and this project
 * deliberately runs development and production against the same database. So
 * seeding *is* writing to production, which is only acceptable because that
 * database holds nothing but generated data. If real users ever appear, give
 * production its own database rather than relying on this check.
 *
 * `SEED_ALLOW` names the database that may be seeded. Pinning it to a name
 * rather than a truthy flag means an environment with no `SEED_ALLOW` refuses,
 * which is what CI and a fresh clone look like.
 *
 * It does not protect production. Env vars are set in the Vercel dashboard by
 * hand, per environment (see HANDOFF §1), so whether `SEED_ALLOW` is present
 * there is a fact about the dashboard that this file cannot check and an
 * earlier version of this comment got wrong. **Assume `SEED_ALLOW` is set in
 * production, because that is the unsafe assumption**, and treat `pnpm db:seed`
 * as a write to production until the variable is verified absent.
 *
 * Kept free of `server-only` and of any database import so the rule can be
 * tested without a connection.
 */

export type SeedTarget = {
  /** Host, with credentials and port removed. Safe to print. */
  host: string;
  database: string;
};

export type SeedVerdict =
  | { ok: true; target: SeedTarget }
  | { ok: false; target: SeedTarget | null; reason: string };

/**
 * Reads the host and database out of a connection string.
 *
 * Returns null rather than throwing, because a missing or malformed URL is a
 * thing this function is asked to *report* on, not crash on.
 */
export function parseSeedTarget(databaseUrl: string | undefined): SeedTarget | null {
  if (!databaseUrl) return null;

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }

  if (!url.hostname) return null;

  return {
    host: url.hostname,
    // A trailing slash with no database name yields '', which is a real
    // (if unhelpful) answer rather than a parse failure.
    database: url.pathname.replace(/^\//, ''),
  };
}

export function describeSeedTarget(target: SeedTarget | null): string {
  if (!target) return 'no database (DATABASE_URL is missing or unparseable)';

  return target.database ? `${target.host}/${target.database}` : `${target.host}/`;
}

/**
 * A refusal message that says what to do, not just what went wrong.
 *
 * Every refusal names the database it refused, so the next reader does not have
 * to go looking for which host was actually in play.
 */
function refusal(target: SeedTarget | null, problem: string, fix: string): SeedVerdict {
  return {
    ok: false,
    target,
    reason: `Refusing to seed ${describeSeedTarget(target)}: ${problem}\n${fix}`,
  };
}

/**
 * A refusal, as opposed to a failure.
 *
 * The distinction is only ever used to decide whether to print a stack trace:
 * a refusal is the guard working correctly, so it prints its message alone.
 */
export class SeedRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRefusal';
  }
}

export function assessSeedTarget(
  databaseUrl: string | undefined,
  seedAllow: string | undefined
): SeedVerdict {
  const target = parseSeedTarget(databaseUrl);

  if (!target) {
    return refusal(
      target,
      'DATABASE_URL is missing or not a connection string.',
      'Set DATABASE_URL to a development database, and SEED_ALLOW to its database name.'
    );
  }

  const allowed = seedAllow?.trim() ?? '';

  // One check, not two. An earlier version tested for empty and then for
  // mismatch separately, which made the empty branch untestable: the mismatch
  // branch also rejects '', so removing the empty check changed nothing and no
  // test noticed. A check that cannot fail is not a check, so the two are
  // merged and only the message is conditional.
  if (allowed !== target.database) {
    const problem =
      allowed === ''
        ? 'SEED_ALLOW is not set.'
        : `SEED_ALLOW is "${allowed}", which is not this database's name.`;

    return refusal(
      target,
      problem,
      `Set SEED_ALLOW=${target.database} only once you are certain this database holds nothing but fake data.`
    );
  }

  return { ok: true, target };
}