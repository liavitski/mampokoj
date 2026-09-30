// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({ mocks: { findMany: vi.fn() } }));

vi.mock('@/server/db', () => ({
  db: { query: { ads: { findMany: mocks.findMany } } },
}));

const { GET } = await import('../route');

/** A row as Drizzle returns it, with every column populated. */
function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'oauth-account-id-42',
    title: 'Bright room',
    price: '8500.00',
    city: 'Prague',
    region: 'PR',
    availableFrom: new Date('2026-01-15T00:00:00.000Z'),
    description: 'A bright room.',
    contactPhone: '+420776123456',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    images: [],
    ...overrides,
  };
}

function request(query = '') {
  return new Request(`https://mampokoj.test/api/ads${query}`);
}

function lastFindManyArg() {
  return mocks.findMany.mock.calls.at(-1)![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe('GET /api/ads privacy', () => {
  it('never returns the poster account id', async () => {
    mocks.findMany.mockResolvedValue([fullRow()]);

    const body = await (await GET(request())).json();

    expect(JSON.stringify(body)).not.toContain('oauth-account-id-42');
  });

  it('never returns the contact phone number', async () => {
    mocks.findMany.mockResolvedValue([fullRow()]);

    const body = await (await GET(request())).json();

    expect(JSON.stringify(body)).not.toContain('+420776123456');
  });

  it('does not select the private columns from the database at all', async () => {
    mocks.findMany.mockResolvedValue([fullRow()]);

    await GET(request());

    // Belt and braces: the columns are excluded at the query as an allowlist,
    // so they are never loaded -- not merely stripped on the way out.
    const columns = lastFindManyArg().columns;
    expect(columns).toBeDefined();
    expect(columns).not.toHaveProperty('userId');
    expect(columns).not.toHaveProperty('contactPhone');
    expect(columns.title).toBe(true);
  });

  it('still returns the fields the ad grid renders', async () => {
    mocks.findMany.mockResolvedValue([fullRow()]);

    const body = await (await GET(request())).json();

    expect(body.items[0]).toMatchObject({
      title: 'Bright room',
      city: 'Prague',
      region: 'PR',
    });
  });
});

describe('GET /api/ads input validation', () => {
  it('caps an oversized limit instead of honouring it', async () => {
    await GET(request('?limit=100000'));

    // limit + 1 is fetched to detect hasMore, so the cap shows up as max + 1.
    expect(lastFindManyArg().limit).toBeLessThanOrEqual(51);
  });

  it('rejects a limit that is not a number', async () => {
    const response = await GET(request('?limit=abc'));

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('rejects a negative limit', async () => {
    const response = await GET(request('?limit=-5'));

    expect(response.status).toBe(400);
  });

  it('rejects a zero limit', async () => {
    const response = await GET(request('?limit=0'));

    expect(response.status).toBe(400);
  });

  it('accepts a limit inside the allowed range', async () => {
    const response = await GET(request('?limit=5'));

    expect(response.status).toBe(200);
    expect(lastFindManyArg().limit).toBe(6);
  });

  it('rejects an unknown region code', async () => {
    const response = await GET(request('?region=XX'));

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('accepts a known region code', async () => {
    const response = await GET(request('?region=PR'));

    expect(response.status).toBe(200);
  });

  it('rejects a cursor whose id is not a uuid', async () => {
    const response = await GET(
      request('?cursorCreatedAt=2026-01-01T00:00:00.000Z&cursorId=nope')
    );

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('rejects a cursor whose timestamp is not a date', async () => {
    const response = await GET(
      request(
        '?cursorCreatedAt=not-a-date&cursorId=11111111-1111-4111-8111-111111111111'
      )
    );

    expect(response.status).toBe(400);
  });
});

describe('GET /api/ads pagination', () => {
  it('reports hasMore when a full page plus one row comes back', async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      fullRow({ id: `00000000-0000-4000-8000-00000000000${i}` })
    );
    mocks.findMany.mockResolvedValue(rows);

    const body = await (await GET(request('?limit=10'))).json();

    expect(body.hasMore).toBe(true);
    expect(body.items).toHaveLength(10);
    expect(body.nextCursor).not.toBeNull();
  });

  it('returns a null cursor on the last page', async () => {
    mocks.findMany.mockResolvedValue([fullRow()]);

    const body = await (await GET(request('?limit=10'))).json();

    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });
});
