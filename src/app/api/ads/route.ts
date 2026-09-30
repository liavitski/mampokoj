import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAds } from '@/server/queries/select';
import { toPublicAd } from '@/lib/ad-dto';
import { PAGE_SIZE } from '@/constants';
import { isRegionCode } from '@/utils/utils';
import type { AdsApiResponse } from '@/types/db-types';

/**
 * Upper bound on a single page. Without it `?limit=1000000` asks the database
 * for a million rows. Oversized values are clamped rather than rejected so a
 * curious client gets a page instead of a 400.
 */
const MAX_LIMIT = 50;

const querySchema = z
  .object({
    region: z.string().refine(isRegionCode, 'Unknown region code').optional(),

    limit: z.coerce
      .number()
      .int('Limit must be a whole number')
      .min(1, 'Limit must be at least 1')
      .transform((limit) => Math.min(limit, MAX_LIMIT))
      .default(PAGE_SIZE),

    cursorCreatedAt: z.iso.datetime('Invalid cursor timestamp').optional(),
    cursorId: z.uuid('Invalid cursor id').optional(),
  })
  .refine(
    ({ cursorCreatedAt, cursorId }) =>
      (cursorCreatedAt === undefined) === (cursorId === undefined),
    { message: 'cursorCreatedAt and cursorId must be sent together' }
  );

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

    const { region, limit, cursorCreatedAt, cursorId } = parsed.data;

    const { items, hasMore, nextCursor } = await getAds(
      limit,
      region,
      cursorCreatedAt && cursorId
        ? { createdAt: new Date(cursorCreatedAt), id: cursorId }
        : undefined
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
