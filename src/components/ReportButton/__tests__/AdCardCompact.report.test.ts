// @vitest-environment node
/**
 * Where the report control appears, and when.
 *
 * Read from the source rather than rendered, for the reason
 * `AdCardCompact.placement.test.ts` gives: `AdCardCompact` is an `async` Server
 * Component that awaits the session, so it cannot be mounted in a test without a
 * database and a session. The rules here are placement and gating decisions --
 * a module renders the control or it does not, and renders it only for a
 * signed-in reader or it does not -- and a source check states them exactly.
 *
 * `ReportButton` itself is covered by its own tests, which do render it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function read(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

const COMPACT = read('../../AdCard/AdCardCompact.tsx');

describe('report control placement', () => {
  it('offers the report control on the public ad view', () => {
    // Matched on the usage rather than the import: an unused import would
    // satisfy a weaker check, and so would a comment mentioning it.
    expect(COMPACT).toMatch(/<ReportButton\s+adId=\{ad\.id\}/);
  });

  it('offers it only to a signed-in reader', () => {
    // The action refuses an anonymous caller anyway, so an unguarded button
    // would be a control that can only ever fail. Gating it in the server
    // component means the session is read once, where it already is for the
    // phone number.
    //
    // The gap is bounded so the guard has to be the expression the button sits
    // in: an unbounded `[\s\S]*` would match a `currentUser` used for the phone
    // number several hundred characters earlier.
    expect(COMPACT).toMatch(
      /\{currentUser\s*&&\s*\([\s\S]{0,200}?<ReportButton/
    );
  });

  it('leaves the dashboard card alone', () => {
    // The owner reporting their own ad would be refused by the action, and the
    // control would only ever produce an error. That is the regression to catch.
    expect(read('../../AdCard/AdCard.tsx')).not.toMatch(/ReportButton/);
  });

  it('leaves the browse grid alone', () => {
    // `AdSummaryCard` wraps the whole tile in a Link, so a control inside it is
    // an interactive element nested in an anchor, rendered once per ad on the
    // grid. Reporting is deliberately reachable from the detail view instead.
    expect(read('../../AdSummaryCard/AdSummaryCard.tsx')).not.toMatch(
      /ReportButton/
    );
  });

  it('renders inside the info wrapper, so the modal box owns the surface', () => {
    // Placed inside InfoWrapper rather than beside the gallery: the modal's box
    // supplies the card surface via [data-modal-box], and a control outside the
    // wrapper would land outside the styled area that override covers.
    const infoWrapper = COMPACT.slice(
      COMPACT.indexOf('<InfoWrapper>'),
      COMPACT.indexOf('</InfoWrapper>')
    );

    expect(infoWrapper).toMatch(/<ReportButton/);
  });

  it('passes the ad id rather than a value the card was given', () => {
    // The button needs the id of *this* ad. Reading it off the prop object
    // inside the destructured block would break the moment the destructuring is
    // rearranged.
    expect(COMPACT).toMatch(/<ReportButton\s+adId=\{ad\.id\}/);
    expect(COMPACT).not.toMatch(/<ReportButton\s+adId=\{id\}/);
  });

  it('does not tell the card whether the ad is already reported', () => {
    // `reportedAt` is withheld from `AdWithoutUserId`, so nothing here can
    // branch on it. A prop that looked like it read the flag would mean the
    // column had reached a public payload after all.
    expect(COMPACT).not.toMatch(/reportedAt/);
  });
});

describe('report control placement in the info grid', () => {
  const styles = read('../../AdCard/AdCardCompact.styles.tsx');

  it('gives the control its own grid area', () => {
    // InfoWrapper is an explicit grid: every child needs a named area, or it
    // lands in an implicit row and the card's alignment shifts.
    expect(styles).toMatch(/grid-template-areas:[\s\S]*'report report'/);
    expect(styles).toMatch(/grid-area: report/);
  });

  it('widens the row track to match', () => {
    // The row list is spelled out separately from the areas, so adding an area
    // without adding its track is the easy half of this to forget -- and the
    // grid falls back to an implicit row rather than failing.
    expect(styles).toMatch(/grid-template-rows:\s*auto auto auto auto auto auto/);
  });
});
