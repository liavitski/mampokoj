import { describe, expect, it } from 'vitest';

import { assessSeedTarget, describeSeedTarget, parseSeedTarget } from '../seed-guard';

/**
 * Two databases on different hosts. This project uses only one in practice, but
 * the guard must still handle "some other database", and a name-based check is
 * what makes that a refusal rather than a silent seed.
 */
const DEV_URL =
  'postgresql://user:pass@dev-host.neon.tech/neondb?sslmode=require';
const PROD_URL =
  'postgresql://user:pass@prod-host.neon.tech/mampokoj_prod?sslmode=require';

describe('parseSeedTarget', () => {
  it('reads the host and database out of a connection string', () => {
    expect(parseSeedTarget(DEV_URL)).toEqual({
      host: 'dev-host.neon.tech',
      database: 'neondb',
    });
  });

  it('never carries credentials or the port into the printed target', () => {
    // The target is printed to a terminal, and these end up in CI logs.
    const target = parseSeedTarget(
      'postgresql://admin:hunter2@db.internal:5432/prod'
    );

    expect(target).toEqual({ host: 'db.internal', database: 'prod' });
    expect(describeSeedTarget(target)).not.toContain('hunter2');
    expect(describeSeedTarget(target)).not.toContain('5432');
  });

  it('returns null for a missing or unparseable URL rather than throwing', () => {
    expect(parseSeedTarget(undefined)).toBeNull();
    expect(parseSeedTarget('')).toBeNull();
    expect(parseSeedTarget('not-a-url')).toBeNull();
  });

  it('handles a URL with no database name', () => {
    expect(parseSeedTarget('postgresql://user@host/')).toEqual({
      host: 'host',
      database: '',
    });
  });
});

describe('assessSeedTarget', () => {
  it('permits seeding when SEED_ALLOW names that exact database', () => {
    expect(assessSeedTarget(DEV_URL, 'neondb')).toMatchObject({ ok: true });
  });

  it('refuses when SEED_ALLOW is absent, and says so', () => {
    // The default is refuse. A missing variable is the state a fresh clone and
    // most deploy environments are in, so it has to be the safe one.
    //
    // Asserting the *message* as well as the refusal is deliberate: an earlier
    // version had separate "not set" and "wrong name" branches, and deleting
    // the first changed no outcome, so no test failed. The wording is what
    // makes the remaining branch observable.
    const verdict = assessSeedTarget(DEV_URL, undefined);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain('SEED_ALLOW is not set.');
  });

  it('refuses a truthy SEED_ALLOW that is not the database name', () => {
    // This is the case a bare flag would wave through: `1`, `true` and `yes`
    // all read as "enabled" to a naive check.
    for (const value of ['1', 'true', 'yes', 'TRUE']) {
      expect(assessSeedTarget(PROD_URL, value).ok, value).toBe(false);
    }
  });

  it('refuses when SEED_ALLOW names a different database on the same host', () => {
    const sameHostOtherDb =
      'postgresql://user:pass@dev-host.neon.tech/mampokoj_prod';

    expect(assessSeedTarget(sameHostOtherDb, 'neondb').ok).toBe(false);
  });

  it('allows a database whose own name is in SEED_ALLOW', () => {
    // The rule is "did you name this database", not "does the host look like
    // development". A host check would need updating whenever Neon renames a
    // branch, and would refuse a database that is legitimately disposable. This
    // project shares one database across environments, so a host check would
    // refuse the only database there is.
    const verdict = assessSeedTarget(PROD_URL, 'mampokoj_prod');

    expect(verdict.ok).toBe(true);
  });

  it('tolerates surrounding whitespace in SEED_ALLOW', () => {
    // Copy-pasting into a .env often drags a space along; that should not be
    // the difference between a seed and a refusal.
    expect(assessSeedTarget(DEV_URL, '  neondb  ').ok).toBe(true);
  });

  it('names the database it refused, so the reader knows what was in play', () => {
    const verdict = assessSeedTarget(PROD_URL, 'neondb');

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain('prod-host.neon.tech/mampokoj_prod');
  });

  it('says how to allow a database rather than only what is wrong', () => {
    const verdict = assessSeedTarget(DEV_URL, undefined);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain('SEED_ALLOW=neondb');
  });

  it('refuses when DATABASE_URL is missing entirely', () => {
    const verdict = assessSeedTarget(undefined, 'neondb');

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toContain('DATABASE_URL');
  });
});