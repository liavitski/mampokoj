// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { adInputSchema, parseAdFormData } from '../ad-schema';
import { adFormData } from '@/test/ad-form-data';

const VALID = {
  title: 'Bright room in a quiet flat',
  price: '8500.00',
  city: 'Prague',
  region: 'PR',
  availableFrom: '2026-01-15',
  description: 'A bright room available from January.',
  contactPhone: '+420776123456',
};

describe('adInputSchema', () => {
  it('accepts a complete, valid ad', () => {
    const result = adInputSchema.safeParse(VALID);

    expect(result.success).toBe(true);
  });

  it('rejects a title longer than the column allows', () => {
    const result = adInputSchema.safeParse({
      ...VALID,
      title: 'x'.repeat(61),
    });

    expect(result.success).toBe(false);
  });

  it('accepts a title of exactly the maximum length', () => {
    const result = adInputSchema.safeParse({ ...VALID, title: 'x'.repeat(60) });

    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(adInputSchema.safeParse({ ...VALID, title: '' }).success).toBe(false);
  });

  it('rejects a title that is only whitespace', () => {
    expect(
      adInputSchema.safeParse({ ...VALID, title: '   ' }).success
    ).toBe(false);
  });

  it('rejects a city longer than the column allows', () => {
    const result = adInputSchema.safeParse({ ...VALID, city: 'x'.repeat(81) });

    expect(result.success).toBe(false);
  });

  it('rejects a region code that is not a Czech region', () => {
    expect(adInputSchema.safeParse({ ...VALID, region: 'XX' }).success).toBe(
      false
    );
  });

  it('rejects a price that is not a number', () => {
    expect(adInputSchema.safeParse({ ...VALID, price: 'free' }).success).toBe(
      false
    );
  });

  it('rejects a negative price', () => {
    expect(adInputSchema.safeParse({ ...VALID, price: '-1' }).success).toBe(
      false
    );
  });

  it('rejects a price beyond the precision the column can store', () => {
    const result = adInputSchema.safeParse({ ...VALID, price: '99999999999' });

    expect(result.success).toBe(false);
  });

  it('rejects a phone number with letters', () => {
    expect(
      adInputSchema.safeParse({ ...VALID, contactPhone: '+420abcdef' }).success
    ).toBe(false);
  });

  it('accepts a phone number at the column limit', () => {
    // '+' plus 15 digits is exactly varchar(16).
    const result = adInputSchema.safeParse({
      ...VALID,
      contactPhone: '+420123456789012',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a phone number longer than the column allows', () => {
    const result = adInputSchema.safeParse({
      ...VALID,
      contactPhone: '+4201234567890123',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a phone number with too few digits', () => {
    expect(
      adInputSchema.safeParse({ ...VALID, contactPhone: '+4201' }).success
    ).toBe(false);
  });

  it('rejects a date that is not a date', () => {
    expect(
      adInputSchema.safeParse({ ...VALID, availableFrom: 'tomorrow' }).success
    ).toBe(false);
  });

  it('rejects an empty description', () => {
    expect(
      adInputSchema.safeParse({ ...VALID, description: '' }).success
    ).toBe(false);
  });

  it('parses the available date into a Date at UTC midnight', () => {
    const result = adInputSchema.safeParse(VALID);

    // "Available from" is a calendar date, not an instant. Anchoring it at
    // UTC midnight is what makes it round-trip through the edit form without
    // shifting a day.
    expect(result.success && result.data.availableFrom).toEqual(
      new Date('2026-01-15T00:00:00.000Z')
    );
  });

  it('normalises the price to a string the numeric column accepts', () => {
    const result = adInputSchema.safeParse({ ...VALID, price: '8500' });

    expect(result.success && result.data.price).toBe('8500.00');
  });
});

describe('parseAdFormData', () => {
  it('accepts a well-formed submission', () => {
    const result = parseAdFormData(adFormData());

    expect(result.success).toBe(true);
  });

  it('rejects a missing field instead of writing undefined to the database', () => {
    const formData = new FormData();
    formData.set('title', 'Only a title');

    const result = parseAdFormData(formData);

    expect(result.success).toBe(false);
  });

  it('rejects a field sent as a file rather than text', () => {
    const formData = adFormData();
    formData.set('title', new File(['x'], 'title.txt'));

    const result = parseAdFormData(formData);

    expect(result.success).toBe(false);
  });

  it('returns a message safe to show a user', () => {
    const result = parseAdFormData(adFormData({ title: '' }));

    expect(result.success).toBe(false);
    // Must not leak a stack trace, a SQL fragment or a Zod issue path.
    expect(result.success === false && result.error).toMatch(/title/i);
    expect(result.success === false && result.error).not.toContain('invalid_');
    expect(result.success === false && result.error).not.toContain('[');
  });

  it('does not surface the internal error type to the caller', () => {
    const result = parseAdFormData(adFormData({ price: 'free' }));

    expect(result.success === false && typeof result.error).toBe('string');
  });
});
