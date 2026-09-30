import { describe, expect, it } from 'vitest';

import { formatCZPhone, isRegionCode, range } from '../utils';

describe('formatCZPhone', () => {
  it('formats a bare 9-digit Czech number into +420 groups', () => {
    expect(formatCZPhone('776123456')).toBe('+420 776 123 456');
  });

  it('strips the 00 international prefix before grouping', () => {
    expect(formatCZPhone('00420776123456')).toBe('+420 776 123 456');
  });

  it('strips a leading 420 country code before grouping', () => {
    expect(formatCZPhone('420776123456')).toBe('+420 776 123 456');
  });

  it('returns the input unchanged when it is not a 9-digit Czech number', () => {
    expect(formatCZPhone('12345')).toBe('12345');
  });
});

describe('isRegionCode', () => {
  it('accepts a known region code', () => {
    expect(isRegionCode('PR')).toBe(true);
  });

  it('rejects an unknown region code', () => {
    expect(isRegionCode('XX')).toBe(false);
  });

  it('rejects a full region name', () => {
    expect(isRegionCode('Prague')).toBe(false);
  });
});

describe('range', () => {
  it('produces an exclusive range', () => {
    expect(range(0, 3)).toEqual([0, 1, 2]);
  });

  it('treats a single argument as a count from zero', () => {
    expect(range(3)).toEqual([0, 1, 2]);
  });
});
