import { db } from '@/server/db';
import { PAGE_SIZE } from '@/constants';
import { NextResponse } from 'next/server';
import { AdsApiResponse, AdsCursor } from '@/types/db-types';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const region = url.searchParams.get('region') ?? undefined;

    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : PAGE_SIZE;

    const cursorCreatedAt = url.searchParams.get('cursorCreatedAt');
    const cursorId = url.searchParams.get('cursorId');

    const cursor: AdsCursor | undefined =
      cursorCreatedAt && cursorId
        ? {
            createdAt: new Date(cursorCreatedAt),
            id: cursorId,
          }
        : undefined;

    const adsPage = await db.query.ads.findMany({
      where: (ads, { and, eq, lt, or }) => {
        const base = region ? eq(ads.region, region) : undefined;

        const pagination = cursor
          ? or(
              lt(ads.createdAt, cursor.createdAt),
              and(
                eq(ads.createdAt, cursor.createdAt),
                lt(ads.id, cursor.id)
              )
            )
          : undefined;

        return and(base, pagination);
      },

      limit: limit + 1,
      orderBy: (adsTable, { desc }) => [
        desc(adsTable.createdAt),
        desc(adsTable.id),
      ],

      with: {
        images: {
          limit: 1,
          orderBy: (img, { desc }) => [desc(img.createdAt)],
        },
      },
    });

    const hasMore = adsPage.length > limit;
    const items = hasMore ? adsPage.slice(0, limit) : adsPage;

    let nextCursor: AdsApiResponse['nextCursor'] = null;

    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];

      nextCursor = {
        cursorCreatedAt: last.createdAt.toISOString(),
        cursorId: last.id,
      };
    }

    return NextResponse.json({
      items,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Failed to fetch ads:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
