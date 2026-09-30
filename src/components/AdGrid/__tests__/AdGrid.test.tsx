import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// AdGrid reads the active region from the URL. Outside a router there is none.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// AdGrid reports failures through the toast system.
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import AdGrid from '../AdGrid';
import type { PublicAd } from '@/types/db-types';

function makeAd(n: number): PublicAd {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    title: `Room number ${n}`,
    price: '8500.00',
    city: 'Prague',
    region: 'PR',
    availableFrom: new Date('2026-01-15T00:00:00.000Z'),
    description: 'A bright room.',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    images: [],
  };
}

const FIRST_PAGE = {
  items: [makeAd(1), makeAd(2)],
  hasMore: true,
  nextCursor: {
    cursorCreatedAt: '2026-01-01T00:00:00.000Z',
    cursorId: '00000000-0000-4000-8000-000000000002',
  },
};

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  return vi.fn().mockResolvedValue(response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AdGrid load more', () => {
  it('appends the next page to the ads already shown', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      json: async () => ({
        items: [makeAd(3)],
        hasMore: false,
        nextCursor: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdGrid adsData={FIRST_PAGE} />);

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('Room number 3')).toBeInTheDocument();
    });
    expect(screen.getByText('Room number 1')).toBeInTheDocument();
    expect(screen.getByText('Room number 2')).toBeInTheDocument();
  });

  it('keeps the current page when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      })
    );

    render(<AdGrid adsData={FIRST_PAGE} />);

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    // The error body has no `items`, so a naive spread of it threw and took
    // the whole grid down with it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeEnabled();
    });
    expect(screen.getByText('Room number 1')).toBeInTheDocument();
    expect(screen.queryByText('Room number 3')).not.toBeInTheDocument();
  });

  it('keeps the current page when the response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      })
    );

    render(<AdGrid adsData={FIRST_PAGE} />);

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('Room number 1')).toBeInTheDocument();
    });
  });

  it('hides the load more button when there is no next page', () => {
    render(
      <AdGrid
        adsData={{
          items: [makeAd(1)],
          hasMore: false,
          nextCursor: null,
        }}
      />
    );

    expect(
      screen.queryByRole('button', { name: /load more/i })
    ).not.toBeInTheDocument();
  });

  it('does not request a page twice while one is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AdGrid adsData={FIRST_PAGE} />);

    const button = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ items: [], hasMore: false, nextCursor: null }) });
  });
});
