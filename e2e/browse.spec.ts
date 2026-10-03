import { expect, test } from '@playwright/test';

import { PAGE_SIZE } from '../src/constants';
import { appShell, cardIds, gridReady } from './support/app-shell';

/**
 * Browsing the grid.
 *
 * The first item on §2.2's priority list, and the one that matters most: `/` is
 * the only route every visitor reaches, and it is the only one that runs entirely
 * on the server with no session.
 *
 * Cross-checked against `/api/ads` rather than against a hardcoded card count.
 * The rendered grid and the JSON endpoint are produced by the same query, so
 * comparing them catches a mismatch between what the page shows and what the API
 * promises -- which a count assertion cannot, since both would move together.
 */
test.describe('browse', () => {
  test('renders a grid of ads, each linking to its own page', async ({ page }) => {
    await page.goto('/');
    await gridReady(page);

    const cards = appShell(page).locator('a[href^="/ad/"]');
    const count = await cards.count();

    expect(count).toBeGreaterThan(0);

    // A full first page, and never more than one. Both are properties of the query
    // rather than of the data: `getAds` is bounded on principle.
    expect(count).toBeLessThanOrEqual(PAGE_SIZE);

    // Every card points at a real ad id. A malformed href would render as a card
    // and 404 on click, which no assertion above would notice.
    const hrefs = await cards.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href') ?? '')
    );

    for (const href of hrefs) {
      expect(href).toMatch(
        /^\/ad\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
  });

  test('shows the same ads the API returns', async ({ page, request }) => {
    await page.goto('/');

    // Not `goto` alone: the response is streamed, so the grid is briefly
    // incomplete. Reading it mid-stream compared 20 links against the API's 10 and
    // failed a page that was in fact correct.
    const fromPage = await cardIds(page);

    const response = await request.get('/api/ads');
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { items: { id: string }[] };
    const fromApi = body.items.map((item) => item.id);

    // Order included. The grid is newest-first and the API is too; a mismatch
    // here would mean the page and the paginated endpoint disagree about the
    // cursor the "Load more" button then hands back.
    expect(fromPage).toEqual(fromApi);
  });

  test('gives every card a heading with the ad title', async ({ page }) => {
    // `AdSummaryCard` renders its title as an `h2` inside the link, which is what
    // makes the grid navigable by heading. Asserted because a card that lost its
    // heading would still look correct and still pass a count check.
    await page.goto('/');
    await gridReady(page);

    const headings = appShell(page).locator('a[href^="/ad/"] h2');

    expect(await headings.count()).toBe(
      await appShell(page).locator('a[href^="/ad/"]').count()
    );
    await expect(headings.first()).not.toBeEmpty();
  });

  test('runs without uncaught JavaScript errors', async ({ page }) => {
    // What this is for: an uncaught exception or a hydration mismatch. Either
    // means the client and the server disagreed, or a component threw, and
    // neither shows up in the DOM assertions -- the page still renders.
    //
    // What it deliberately is not: "no failed requests". Every seeded ad photo
    // points at a ufs.sh host and every one of those files is gone, so the image
    // optimizer answers 404 for all ten cards on the first page and Chromium logs
    // one console error per image. Those are orphaned database rows pointing at
    // deleted uploads -- what `pnpm storage:reconcile` exists to find, recorded in
    // HANDOFF.md §2.3 -- and not a rendering defect.
    //
    // Asserting zero console errors regardless would have left this suite
    // permanently red for a reason no change to this repository can fix, which is
    // how a test comes to be ignored. The filter below is the narrowest one that
    // still lets hydration and thrown-error reporting through.
    const thrown: string[] = [];
    const logged: string[] = [];

    page.on('pageerror', (error) => thrown.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // "Failed to load resource: ..." is Chromium reporting an HTTP status. The
      // statuses that matter are asserted where they matter: the ads endpoint
      // above, and the not-found pages in ad-detail.spec.ts.
      if (message.text().startsWith('Failed to load resource')) return;

      logged.push(message.text());
    });

    await page.goto('/');
    await gridReady(page);

    expect(thrown).toEqual([]);
    expect(logged).toEqual([]);
  });
});
