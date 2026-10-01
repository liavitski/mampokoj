// @vitest-environment node
/**
 * Which cards blur the contact number.
 *
 * Read from the source rather than rendered: `AdCard` and `AdCardCompact` are
 * both `async` Server Components that await the session, so neither can be
 * mounted in a test without a database and a session. The rule is a placement
 * decision -- a module either imports the blur or it does not -- and a source
 * check states it exactly.
 *
 * `AdCardCompact` is the public view (the modal and /ad/[adId]); `AdCard` is the
 * owner's dashboard, where the number is already the reader's own and a click to
 * see it would be a pointless step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function read(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

describe('contact number blur placement', () => {
  it('blurs the number on the public ad view', () => {
    // Matched on the usage, not the import: an unused import would satisfy a
    // weaker check, and swapping the element back for the bare string -- which
    // ships the digits unblurred to every signed-in visitor -- would too.
    expect(read('../../AdCard/AdCardCompact.tsx')).toMatch(
      /<BlurredPhone\s+phone=\{/
    );
  });

  it('leaves the dashboard card alone', () => {
    // A future change routing the dashboard through BlurredPhone would make the
    // owner click to see their own number. That is the regression to catch.
    expect(read('../../AdCard/AdCard.tsx')).not.toMatch(/BlurredPhone/);
  });

  it('keeps the signed-out branch free of the digits', () => {
    // Signed out renders a plain string, so the number never reaches the HTML.
    // Asserting the branch exists at all: if someone swaps it for a blurred
    // placeholder, the digits would start shipping to signed-out visitors and
    // the blur would be theatre.
    const source = read('../../AdCard/AdCardCompact.tsx');

    expect(source).toMatch(/currentUser\s*\?/);
    expect(source).toMatch(/'Log in to see the contact'/);
  });
});
