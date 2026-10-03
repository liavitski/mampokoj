import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAds } from '@/server/queries/select';
import { toPublicAd } from '@/lib/ad-dto';
import { cursorParamsSchema, toAdsCursor } from '@/lib/validation/cursor';
import { PAGE_SIZE } from '@/constants';
import { isRegionCode } from '@/utils/utils';
import type { AdsApiResponse } from '@/types/db-types';

/**
 * Upper bound on a single page. Without it `?limit=1000000` asks the database
 * for a million rows. Oversized values are clamped rather than rejected so a
 * curious client gets a page instead of a 400.
 */
const MAX_LIMIT = 50;

/**
 * `cursorCreatedAt`/`cursorId` come from `cursorParamsSchema` rather than being
 * restated, so this route and the home page agree on what a cursor is. They
 * answer differently on purpose -- this one can answer 400, a page cannot -- but
 * a 500 from the same input on the other surface would be a bug in the shared
 * rules, not in the call site.
 */
const querySchema = cursorParamsSchema.extend({
  region: z.string().refine(isRegionCode, 'Unknown region code').optional(),

  limit: z.coerce
    .number()
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .transform((limit) => Math.min(limit, MAX_LIMIT))
    .default(PAGE_SIZE),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const parsed = querySchema.safeParse(
      Object.fromEntries(url.searchParams)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { region, limit } = parsed.data;

    const { items, hasMore, nextCursor } = await getAds(
      limit,
      region,
      toAdsCursor(parsed.data)
    );

    const response: AdsApiResponse = {
      items: items.map(toPublicAd),
      hasMore,
      nextCursor: nextCursor
        ? {
            cursorCreatedAt: nextCursor.createdAt.toISOString(),
            cursorId: nextCursor.id,
          }
        : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch ads:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
