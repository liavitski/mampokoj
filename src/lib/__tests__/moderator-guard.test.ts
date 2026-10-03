import { describe, expect, it } from 'vitest';

import { isModerator, parseModeratorAllowlist } from '../moderator-guard';

describe('parseModeratorAllowlist', () => {
  it('reads one id', () => {
    expect([...parseModeratorAllowlist('alice')]).toEqual(['alice']);
  });

  it('reads a comma-separated list', () => {
    expect([...parseModeratorAllowlist('alice,bob,carol')]).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });

  it('trims the spaces a hand-edited .env tends to grow', () => {
    // MODERATORS=alice, bob is the obvious thing to type, and without the trim
    // the second id would silently never match anybody.
    expect([...parseModeratorAllowlist(' alice , bob ')]).toEqual(['alice', 'bob']);
  });

  it('drops an empty entry rather than admitting it', () => {
    // A trailing comma -- "alice,bob," -- must not put '' in the set. Paired
    // with isModerator's null check that cannot match anything today, but an
    // empty string in an allowlist is a latent way to match one.
    expect([...parseModeratorAllowlist('alice,,bob,')]).toEqual(['alice', 'bob']);
    expect(parseModeratorAllowlist('alice,,bob,').has('')).toBe(false);
  });

  it('reads an unset variable as nobody', () => {
    // The failure mode of an unset allowlist on a live site is an open takedown
    // button, so this has to be empty rather than a wildcard.
    expect(parseModeratorAllowlist(undefined).size).toBe(0);
    expect(parseModeratorAllowlist('').size).toBe(0);
    expect(parseModeratorAllowlist('   ').size).toBe(0);
    expect(parseModeratorAllowlist(',,,').size).toBe(0);
  });

  it('keeps duplicate ids out', () => {
    expect([...parseModeratorAllowlist('alice,alice,bob')]).toEqual([
      'alice',
      'bob',
    ]);
  });
});

describe('isModerator', () => {
  it('accepts an id on the list', () => {
    expect(isModerator('alice', parseModeratorAllowlist('alice,bob'))).toBe(
      true
    );
  });

  it('refuses an id that is not on the list', () => {
    expect(isModerator('mallory', parseModeratorAllowlist('alice,bob'))).toBe(
      false
    );
  });

  it('refuses everyone when the list is unset', () => {
    // Fails closed. This is the assertion that makes it safe to add the check
    // before MODERATORS is configured anywhere.
    expect(isModerator('alice', parseModeratorAllowlist(undefined))).toBe(false);
  });

  it('refuses a signed-out caller', () => {
    expect(isModerator(null, parseModeratorAllowlist('alice'))).toBe(false);
  });

  it('refuses a signed-out caller even when the list holds an empty id', () => {
    // The two checks are separate on purpose. isNull alone would be enough
    // today, but a list that somehow contained '' would otherwise match a
    // falsy session id, and the guard must not depend on the operator never
    // typing a stray comma.
    expect(isModerator(null, new Set(['']))).toBe(false);
  });

  it('does not match on a prefix or a substring', () => {
    // A `startsWith` or `includes` comparison here would let "alice-evil" or
    // "not-alice" moderate. Ids are compared whole or not at all.
    const allowlist = parseModeratorAllowlist('alice');

    expect(isModerator('alice-evil', allowlist)).toBe(false);
    expect(isModerator('not-alice', allowlist)).toBe(false);
    expect(isModerator('alic', allowlist)).toBe(false);
    expect(isModerator('ALICE', allowlist)).toBe(false);
  });
});
