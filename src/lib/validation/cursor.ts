import { z } from 'zod';

import type { AdsCursor } from '@/types/db-types';

/**
 * The infinite scroll's position, as it arrives in a query string.
 *
 * **Why this exists.** `getAds` interpolates the cursor into a `WHERE` clause
 * against a `uuid` column and a `timestamptz` one. Postgres will not accept a
 * string in either position: `?cursorId=not-a-uuid` raises `invalid input
 * syntax for type uuid`, and `new Date('not-a-date')` raises `RangeError:
 * Invalid time value` on the way to becoming a parameter. Both are thrown, not
 * returned, so a URL in the query string was enough to turn the home page into
 * an unhandled 500 -- the same class of bug `adIdSchema` was added for the ad
 * route, which is why it is called out in `HANDOFF.md` §9.4.
 *
 * Validated here rather than at each call site because there are two of them:
 * `page.tsx` and `GET /api/ads`. A second copy of these rules is how the two
 * ends of one contract drift, and the page is the copy that 500s.
 *
 * The pair rule is part of the schema, not a `if (a && b)` at the call site,
 * for the same reason: a lone `cursorId` is a cursor for a row that does not
 * exist, and the two forms should not be able to mean the same thing.
 */
export const cursorParamsSchema = z
  .object({
    cursorCreatedAt: z.iso.datetime('Invalid cursor timestamp').optional(),
    cursorId: z.uuid('Invalid cursor id').optional(),
  })
  .refine(
    ({ cursorCreatedAt, cursorId }) =>
      (cursorCreatedAt === undefined) === (cursorId === undefined),
    { message: 'cursorCreatedAt and cursorId must be sent together' }
  );

export type CursorParams = z.infer<typeof cursorParamsSchema>;

/**
 * Turns validated parameters into the cursor the query layer wants.
 *
 * `undefined` means "no cursor", i.e. the first page. That is the only other
 * answer the schema allows: it cannot report a half cursor, because the pair
 * rule has already rejected those.
 */
export function toAdsCursor(params: CursorParams): AdsCursor | undefined {
  return params.cursorCreatedAt && params.cursorId
    ? { createdAt: new Date(params.cursorCreatedAt), id: params.cursorId }
    : undefined;
}