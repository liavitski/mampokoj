import { describe, expect, it } from 'vitest';

import { cursorParamsSchema, toAdsCursor } from '../cursor';

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-01-15T10:00:00.000Z';

/**
 * The rules `getAds` relies on but cannot enforce itself.
 *
 * Both fields land in a Postgres `uuid`/`timestamptz` comparison, and the
 * database rejects a bad one by throwing rather than returning: that is what
 * made `/?cursorId=not-a-uuid` an unhandled 500 on the home page. The tests
 * below are about the schema turning those two specific throws into a decision,
 * so each case is written as the string that produced a failure.
 */
describe('cursorParamsSchema', () => {
  it('accepts a cursor, which is the only shape the app ever sends', () => {
    expect(
      cursorParamsSchema.safeParse({ cursorCreatedAt: AT, cursorId: ID }).success
    ).toBe(true);
  });

  it('accepts no cursor at all', () => {
    expect(cursorParamsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an id that is not a uuid, before the database can', () => {
    const parsed = cursorParamsSchema.safeParse({
      cursorCreatedAt: AT,
      cursorId: 'not-a-uuid',
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Invalid cursor id');
  });

  /**
   * `new Date('not-a-date')` is an Invalid Date, and drizzle hands it to
   * Postgres anyway -- `RangeError: Invalid time value`, a different throw from
   * the uuid one. Rejecting it here is the only reason that is not a 500.
   */
  it('rejects a timestamp that is not a date', () => {
    const parsed = cursorParamsSchema.safeParse({
      cursorCreatedAt: 'not-a-date',
      cursorId: ID,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Invalid cursor timestamp');
  });

  it('rejects a bare date without an id', () => {
    expect(cursorParamsSchema.safeParse({ cursorCreatedAt: AT }).success).toBe(
      false
    );
  });

  it('rejects a bare id without a date', () => {
    expect(cursorParamsSchema.safeParse({ cursorId: ID }).success).toBe(false);
  });

  it('says why a half cursor is refused', () => {
    const parsed = cursorParamsSchema.safeParse({ cursorId: ID });

    expect(parsed.error?.issues[0]?.message).toBe(
      'cursorCreatedAt and cursorId must be sent together'
    );
  });

  /**
   * `?cursorId=a&cursorId=b` reaches a server component as an array, not a
   * string, so the prop type is a small lie. Zod rejects it, which is the
   * behaviour that matters; asserting it keeps that from quietly changing to a
   * coercion that takes the first value.
   */
  it('rejects a repeated parameter, which arrives as a list', () => {
    expect(
      cursorParamsSchema.safeParse({ cursorCreatedAt: AT, cursorId: [ID, ID] })
        .success
    ).toBe(false);
  });
});

describe('toAdsCursor', () => {
  it('converts a valid cursor into the shape the query layer takes', () => {
    const parsed = cursorParamsSchema.parse({
      cursorCreatedAt: AT,
      cursorId: ID,
    });

    expect(toAdsCursor(parsed)).toEqual({
      createdAt: new Date(AT),
      id: ID,
    });
  });

  /**
   * A real `Date`, not an `Invalid Date` -- the difference between the query
   * running and `RangeError` being thrown while its parameters are built.
   */
  it('never yields an invalid Date', () => {
    const parsed = cursorParamsSchema.parse({
      cursorCreatedAt: AT,
      cursorId: ID,
    });

    expect(Number.isNaN(toAdsCursor(parsed)!.createdAt.getTime())).toBe(false);
  });

  it('means "first page" when there is no cursor', () => {
    expect(toAdsCursor(cursorParamsSchema.parse({}))).toBeUndefined();
  });
});