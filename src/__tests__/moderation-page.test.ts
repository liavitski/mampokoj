// @vitest-environment node
/**
 * The moderation page's two lists: the ad link, and the two-column desktop layout.
 *
 * Read from the source rather than rendered, for the reason
 * `moderation-gate.test.ts` gives: `page.tsx` is an `async` Server Component
 * awaiting the session, so it cannot be mounted without a database and a session.
 *
 * What is asserted here is mostly *absence* and *placement* -- "opens in a new tab
 * without handing over the opener", "the reported list is still first in the
 * source", "the desktop column placement does not survive onto a phone". None of
 * that is observable in a rendered tree: a link that opens in a new tab renders
 * identically to one that does not, and a `grid-column` that leaks past its media
 * query renders as an ordinary single column.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pageSource = readFileSync(
  join(process.cwd(), 'src/app/moderation/page.tsx'),
  'utf8'
);
const stylesSource = readFileSync(
  join(process.cwd(), 'src/app/moderation/page.styles.tsx'),
  'utf8'
);

function stylesFor(componentName: string): string {
  const start = stylesSource.indexOf(`export const ${componentName} =`);

  // To the next `export const`, so a rule cannot be satisfied by an unrelated
  // component that happens to mention the same property.
  const end = stylesSource.indexOf('\nexport const ', start + 1);

  expect(start, `page.styles.tsx exports no ${componentName}`).toBeGreaterThan(-1);

  return stylesSource.slice(start, end === -1 ? undefined : end);
}

/** Character offset of the first occurrence, or -1. */
function at(token: string): number {
  return pageSource.indexOf(token);
}

describe('the stylesheet', () => {
  it('has no backticks inside its CSS comments', () => {
    // A backtick inside a CSS comment terminates the enclosing JS template
    // literal, because a styled-components rule *is* one. The failure is silent
    // in review -- the CSS reads fine -- and it does not surface in `vitest`,
    // because these source-read tests never compile this file. It costs a
    // `pnpm typecheck` to notice, which is a slow way to learn that twice.
    //
    // Scoped to the template literal bodies on purpose: a backtick in the file's
    // top-level JSDoc is legal and there are several. Checking every comment in
    // the file fails on the header instead of on the thing that matters.
    //
    // A whole-file backtick count would not catch it either: both occurrences
    // were a matched pair, so the file's parity stayed even while each was wrong.
    const cssBodies = [
      ...stylesSource.matchAll(/= styled\.[\w.]+(?:<[^>]*>)?`([\s\S]*?)`;/g),
    ].map((match) => match[1]);

    expect(cssBodies.length).toBeGreaterThan(5);

    for (const body of cssBodies) {
      for (const comment of body.matchAll(/\/\*[\s\S]*?\*\//g)) {
        expect(comment[0], 'a backtick inside a CSS comment').not.toContain('`');
      }
    }
  });
});

describe('the ad link', () => {
  it('links a title to the ad as a visitor sees it, in both lists', () => {
    // The public detail page, not a moderation route: what a moderator needs to
    // judge a report is the listing as anybody else receives it, including the
    // photos and the "Report ad" button a real visitor would be offered.
    expect(pageSource).toMatch(/href=\{`\/ad\/\$\{adId\}`\}/);
  });

  it('uses that link in both lists, not just the queue', () => {
    // Counted, because "at least one list links" is the bug this guards: a
    // moderator reading the all ads list has no way to open an ad unless that list
    // links too. One `AdTitle` component serves both, so the count that matters
    // is its uses -- not how many times the href is written.
    const uses = [...pageSource.matchAll(/<AdTitle\s+adId=\{ad\.id\}/g)];

    expect(uses).toHaveLength(2);
  });

  it('opens it in a new window', () => {
    // The reason a new window at all: the moderator is holding a queue position,
    // and navigating away from /moderation loses their place in it. The page is
    // rendered from the server, so going back re-runs both queries.
    expect(pageSource).toContain('target="_blank"');
  });

  it('does not hand the opened page a reference back to this one', () => {
    // `target="_blank"` without `rel="noopener"` gives the opened page a
    // `window.opener` reference to /moderation -- a route whose rows carry every
    // ad's contact phone number. `noreferrer` covers the referrer leak too.
    const rel = pageSource.match(/rel="([^"]*)"/);

    expect(rel, 'the new-tab link sets no rel').not.toBeNull();
    expect(rel![1]).toContain('noopener');
    expect(rel![1]).toContain('noreferrer');
  });

  it('announces the new window to anyone not using a mouse', () => {
    // A link that silently opens a second tab is the textbook surprise for a
    // keyboard or screen-reader user, and there is no browser affordance that
    // warns them. The visible label stays clean; this is text only assistive tech
    // reads.
    expect(pageSource).toContain('opens in a new tab');
    // Deliberately not the `VisuallyHidden` component: that one is `'use client'`
    // with a keydown effect, and pulling it in would hand the whole moderation
    // page a client boundary for a static string.
    expect(stylesFor('VisuallyHiddenText')).toContain('position: absolute');
  });

  it('looks like a link, because it is one', () => {
    // A title that navigates but is painted as body text is a link the eye skips
    // past. Asserted on the link styling existing rather than on a colour value,
    // so a theme change does not fail here.
    expect(stylesFor('AdLink')).toContain('color: var(--color-link)');
  });
});

describe('the two-column desktop layout', () => {
  it('puts all ads on the left and reported ads on the right', () => {
    // Expressed as explicit placement rather than DOM order, because DOM order is
    // what decides the single-column stack and that order has to stay
    // reported-first for phones.
    expect(pageSource).toMatch(/<Section\s+\$column=\{1\}>[\s\S]*?All ads/);
    expect(pageSource).toMatch(/<Section\s+\$column=\{2\}>[\s\S]*?Reported ads/);
  });

  it('keeps the reported list first in the source, so phones are unaffected', () => {
    // "On smaller screens make it like it was" is carried entirely by DOM order:
    // the previous page was reported ads, then all ads. Placement rules can only
    // override that on a wide screen, because they are inside the desktop branch.
    expect(at('Reported ads')).toBeGreaterThan(-1);
    expect(at('All ads')).toBeGreaterThan(-1);
    expect(at('Reported ads')).toBeLessThan(at('All ads'));
  });

  it('drops the column placement below the breakpoint', () => {
    // The bug this guards is subtle and would be invisible on a desktop: a
    // one-column grid that still carries `grid-column: 2` does not stack -- the
    // browser adds an implicit second column and the reported list sits off to
    // the right of an empty one. So the reset has to be in the same rule, after
    // the placement, and asserted here.
    const section = stylesFor('Section');

    expect(section).toContain('grid-column:');
    expect(section).toMatch(/@media[^{]*\{[\s\S]*grid-column:\s*auto/);
    expect(section).toMatch(/@media[^{]*\{[\s\S]*grid-row:\s*auto/);
  });

  it('collapses at the width the rest of the app calls a tablet', () => {
    // QUERIES.tabletAndSmaller rather than a hand-written rem value, so the
    // moderation page turns at the same width as every other responsive rule in
    // the codebase instead of drifting from it.
    expect(stylesFor('Wrapper')).toContain('QUERIES.tabletAndSmaller');
  });

  it('spans the page title across both columns, on the row above them', () => {
    // Without `grid-column: 1 / -1` the `h1` takes column 1 and pushes both lists
    // into a second row.
    expect(stylesFor('Heading')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('puts the title on row 1 and the lists on row 2, not the other way round', () => {
    // Found by rendering, not by reasoning: with `grid-column: 1 / -1` alone and
    // both sections explicitly on row 1, the auto-placed heading no longer fits
    // on row 1 -- grid moves it to the next row where the full width is free,
    // which put the page title *below* both lists at y=2952 on a 3000px page.
    //
    // Spanning the columns and being on the right row are separate facts, and
    // only the second one was missing.
    expect(stylesFor('Heading')).toMatch(/grid-row:\s*1/);
    expect(stylesFor('Section')).toMatch(/grid-row:\s*2/);
  });

  it('gives the two columns more room than the single column had', () => {
    // The wrapper was capped at 800px when it held one list. Two columns inside
    // 800px would be ~390px each, which is narrower than a phone. Parsed rather
    // than pinned to exact pixels so a later theme change is not a test failure.
    const widths = [...stylesFor('Wrapper').matchAll(/max-width:\s*(\d+)px/g)].map(
      (match) => Number(match[1])
    );

    expect(widths.length).toBeGreaterThanOrEqual(2);
    expect(widths).toContain(800);
    expect(Math.max(...widths)).toBeGreaterThan(800);
  });

  it('lets a long title shrink its column instead of widening the page', () => {
    // Grid and flex items default to `min-width: auto`, so one long unbroken
    // title would push its column wider and give the two lists unequal widths.
    // `min-width: 0` is what allows the text to wrap instead.
    expect(stylesFor('Section')).toContain('min-width: 0');
  });

  it('does not give either column its own scroll area', () => {
    // A nested scroll inside the page scroll is a trackpad trap and hides the
    // bottom of a queue behind a second gesture. The columns are laid out side by
    // side and the page scrolls as one.
    expect(stylesFor('Section')).not.toContain('overflow');
    expect(stylesFor('Section')).not.toMatch(/max-height/);
  });
});