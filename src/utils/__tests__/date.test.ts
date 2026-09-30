// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { toDateInputValue } from '../date';

describe('toDateInputValue', () => {
  it('reads the UTC date parts, not the local ones', () => {
    // 23:30 UTC is already the next day in Prague (+02:00). Reading local
    // parts would show -- and then save back -- the wrong date.
    const ad = new Date('2026-01-15T23:30:00.000Z');

    expect(toDateInputValue(ad)).toBe('2026-01-15');
  });

  it('does not shift a date stored at UTC midnight', () => {
    expect(toDateInputValue(new Date('2026-01-15T00:00:00.000Z'))).toBe(
      '2026-01-15'
    );
  });

  it('handles the first day of a month', () => {
    expect(toDateInputValue(new Date('2026-02-01T00:00:00.000Z'))).toBe(
      '2026-02-01'
    );
  });

  it('round-trips through a date input and back to the same instant', () => {
    const original = new Date('2026-03-09T00:00:00.000Z');

    const reparsed = new Date(`${toDateInputValue(original)}T00:00:00.000Z`);

    expect(reparsed.toISOString()).toBe(original.toISOString());
  });

  it('pads single-digit months and days', () => {
    expect(toDateInputValue(new Date('2026-03-09T12:00:00.000Z'))).toBe(
      '2026-03-09'
    );
  });
});
