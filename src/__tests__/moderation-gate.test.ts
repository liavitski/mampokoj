// @vitest-environment node
/**
 * The moderation gate.
 *
 * Read from the source rather than rendered, for the reason
 * `AdCardCompact.placement.test.ts` gives: `page.tsx` is an `async` Server
 * Component awaiting the session, so it cannot be mounted in a test without a
 * database and a session.
 *
 * The rule that matters is *ordering* -- the allowlist is checked before the
 * query runs, not after -- and an ordering cannot be observed by rendering,
 * because a page that renders "Not allowed." after querying has already leaked
 * the data it was supposed to refuse. So it is asserted directly.
 *
 * `isModerator` itself is covered in `src/lib/__tests__/moderator-guard.test.ts`;
 * this file is about the page using it, and using it in the right place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../app/moderation/page.tsx', import.meta.url),
  'utf8'
);

/** Character offset of each token, or -1. */
function at(token: string): number {
  return source.indexOf(token);
}

describe('the moderation gate', () => {
  it('checks the allowlist before it queries the queue', () => {
    const gate = at('isModerator(');
    const query = at('getReportedAds()');

    expect(gate, 'the page never calls isModerator').toBeGreaterThan(-1);
    expect(query, 'the page never queries the queue').toBeGreaterThan(-1);

    // The whole protection. Checked after the query, the reported ads have
    // already been read -- the refusal would be cosmetic.
    expect(
      gate,
      'the queue is queried before the allowlist is checked'
    ).toBeLessThan(query);
  });

  it('reads the allowlist from MODERATORS', () => {
    // Parsed rather than compared inline, so the trimming and the empty-entry
    // handling in moderator-guard apply here too.
    expect(source).toMatch(
      /isModerator\(\s*\w+,\s*parseModeratorAllowlist\(process\.env\.MODERATORS\)/
    );
  });

  it('refuses before reading the session into the page body', () => {
    // Same shape as the dashboard: a plain refusal, not a redirect and not
    // notFound(). A second convention would be its own defect.
    expect(source).toContain('<h3>Not allowed.</h3>');
  });

  it('does not gate on anything to do with the ad being reported', () => {
    // The predicate belongs in the query, not in a per-row check here. A guard
    // in the page would mean the rows were fetched before the decision.
    expect(source).not.toMatch(/reportedAt\s*===|!==\s*null/);
  });

  it('gives every listed ad a way to act on it', () => {
    // A queue with no takedown is the state §9.3 opens by complaining about:
    // the remedy is a hand-written DELETE.
    expect(source).toMatch(/<TakeDownButton\s+adId=\{ad\.id\}/);
  });

  it('shows the contact number, which is the basis of every report', () => {
    expect(source).toContain('ad.contactPhone');
  });

  it('has an empty state rather than rendering an empty list', () => {
    // "Nothing has been reported." is the answer to the question a moderator
    // opens this page with; an empty <ul> looks like a broken query.
    expect(source).toMatch(/reportedAds\.length === 0/);
    expect(source).toContain('Nothing has been reported.');
  });
});

describe('the takedown control', () => {
  const button = readFileSync(
    new URL('../components/moderation/TakeDownButton.tsx', import.meta.url),
    'utf8'
  );

  it('asks for the ad id it was given', () => {
    expect(button).toMatch(/deleteAdAsModerator\(adId\)/);
  });

  it('confirms first, because the action cannot be undone', () => {
    // The asymmetry with ReportButton is deliberate: reporting is free to get
    // wrong, this is not.
    expect(button).toContain('ConfirmDialog');
  });

  it('is marked destructive', () => {
    expect(button).toMatch(/destructive/);
  });

  it('reports a refusal rather than claiming success', () => {
    expect(button).toMatch(/res\.success/);
    expect(button).toMatch(/'error'/);
  });
});
