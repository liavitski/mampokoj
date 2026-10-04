import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { appShell, cardIds, gridReady } from './support/app-shell';

/**
 * The largest `limit` the ads endpoint accepts.
 *
 * Spelled here rather than imported: `MAX_LIMIT` is a private constant in
 * `app/api/ads/route.ts`, and importing it would mean exporting production API
 * surface for a test. `?limit=` is clamped rather than rejected, so a stale
 * value here would over-fetch rather than fail -- and the loop below is bounded
 * regardless.
 */
const MAX_LIMIT = 50;

/** The keyset cursor the ads endpoint hands back for the next page. */
type Cursor = { cursorCreatedAt: string; cursorId: string };

/**
 * The "Load more" control, scoped to the layout shell.
 *
 * Scoped because the streamed copy of the page carries a control of its own, and
 * that is not hypothetical: `expect(loadMore).toHaveCount(0)` at the end of the
 * walk failed reporting one button still attached, having matched the duplicate's
 * copy of a button the real grid had already unmounted.
 */
function loadMoreButton(page: Page): Locator {
  return appShell(page).getByRole('button', { name: 'Load more' });
}

/** How many ad cards the grid is showing. */
async function cardCount(page: Page): Promise<number> {
  // Gated, because the first count after `goto` lands while the shell is still
  // empty. Once a card is visible the wait is a no-op, so polling with this is
  // cheap.
  await gridReady(page);

  return appShell(page).locator('a[href^="/ad/"]').count();
}

/**
 * Clicks "Load more" and waits for the grid to actually grow.
 *
 * Waiting on the button's own text is the obvious thing and it is wrong: `AdGrid`
 * unmounts `LoadMoreButton` entirely on the last page, when `hasMore` goes false.
 * Prague holds 15 ads, so loading its second page removes the button -- there is
 * no element left to read the text *of`, and a `toHaveText('Load more')` wait
 * times out on the last page of every region.
 *
 * Waiting on the card count is what the click actually changes, and it holds on the
 * last page too: the final page's items are appended just as the button unmounts.
 * So there is no "or the button went away" escape hatch here, deliberately. An
 * earlier version had one -- returning early when the button was not visible --
 * and it was worse than useless: the button is briefly detached for a frame after
 * the click, so the wait passed immediately and every caller read the grid before
 * the fetch landed. A button that vanishes *without* the count growing is a real
 * bug, and this is where it should surface.
 *
 * Returns `false` when there was nothing left to load, which is the normal end of
 * every one of these walks rather than a failure.
 */
async function loadAnotherPage(page: Page, loadMore: Locator): Promise<boolean> {
  if (!(await loadMore.isVisible())) return false;

  const before = await cardCount(page);
  await loadMore.click();

  await expect
    .poll(() => cardCount(page), { timeout: 10_000 })
    .toBeGreaterThan(before);

  return true;
}

/**
 * Every ad id the API reports for a region, walking the cursor to the end.
 *
 * Used instead of a hardcoded region membership list, because a list would go
 * stale the moment the seed data changed -- and a stale list makes the assertion
 * it feeds vacuous rather than failing.
 */
async function everyIdInRegion(
  request: APIRequestContext,
  region: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: Cursor | null = null;

  // Bounded so a cursor that fails to advance fails the test instead of hanging
  // it: a non-advancing cursor is the bug this suite is here to catch.
  for (let page = 0; page < 20; page += 1) {
    const url = new URL('/api/ads', 'http://localhost');
    url.searchParams.set('region', region);
    url.searchParams.set('limit', String(MAX_LIMIT));

    if (cursor) {
      url.searchParams.set('cursorCreatedAt', cursor.cursorCreatedAt);
      url.searchParams.set('cursorId', cursor.cursorId);
    }

    const response = await request.get(url.pathname + url.search);
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      items: { id: string }[];
      hasMore: boolean;
      nextCursor: Cursor | null;
    };

    const before = ids.size;
    for (const item of body.items) ids.add(item.id);

    if (!body.hasMore || !body.nextCursor) return ids;

    // A page that added nothing is a cursor that did not move.
    expect(ids.size, 'cursor did not advance').toBeGreaterThan(before);

    cursor = body.nextCursor;
  }

  throw new Error(`cursor did not terminate for region ${region}`);
}

/**
 * "Load more", and the keyset cursor underneath it.
 *
 * Third on §2.1's priority list, and the only flow here that is entirely
 * client-driven after first paint: `AdGrid` fetches `/api/ads` with a
 * `(cursorCreatedAt, cursorId)` pair and appends. Two ways this breaks that a
 * first-page assertion cannot see -- the same ad appended twice when a cursor
 * lands on an equal timestamp, and a cursor that skips rows.
 *
 * `getAds` orders by `(createdAt, id)` and `createdAt` is **not** unique, which is
 * why the id is in the ordering. Seeded data was written in bulk and shares
 * timestamps, so this is the case that actually occurs rather than a theoretical
 * one. Asserting no duplicates and no gaps across several pages is what pins it.
 */
test.describe('load more', () => {
  test('appends the next page instead of replacing the first', async ({ page }) => {
    await page.goto('/');

    await gridReady(page);

    const cards = appShell(page).locator('a[href^="/ad/"]');
    await expect(cards.first()).toBeVisible();

    const before = await cards.count();

    const loadMore = loadMoreButton(page);
    await expect(loadMore).toBeVisible();

    await loadMore.click();

    // Appended, not swapped. `AdGrid` spreads the new items onto the previous
    // array, and the button reads "Loading..." until the fetch resolves.
    await expect
      .poll(async () => cards.count(), { timeout: 10_000 })
      .toBeGreaterThan(before);
  });

  test('never lists the same ad twice across pages', async ({ page }) => {
    // The duplicate would come from a cursor that is not a strict boundary: with a
    // non-unique `createdAt`, a cursor of (t, id) has to resume with
    // `createdAt < t OR (createdAt = t AND id < cursorId)`, or the row the cursor
    // names gets served twice.
    await page.goto('/');

    const loadMore = loadMoreButton(page);

    for (let click = 0; click < 3; click += 1) {
      // Stops on its own at the end of the list, which is why the bound is a
      // convenience rather than the thing that ends the loop.
      if (!(await loadAnotherPage(page, loadMore))) break;
    }

    const ids = await cardIds(page);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('appends ads the first page did not contain', async ({ page, request }) => {
    // The other half of pagination, and the one a duplicate check cannot catch: a
    // cursor that advances past the end of the table yields a shorter second page
    // rather than an overlapping one, and nothing about the first page looks wrong.
    await page.goto('/');

    const first = await cardIds(page);

    const loadMore = loadMoreButton(page);
    await expect(loadMore).toBeVisible();

    expect(await loadAnotherPage(page, loadMore)).toBe(true);

    const all = await cardIds(page);

    expect(all.length).toBeGreaterThan(first.length);

    // Strictly a superset, in the same order: nothing from the first page was
    // dropped or reordered by the append.
    expect(all.slice(0, first.length)).toEqual(first);

    const response = await request.get('/api/ads?limit=50');
    const body = (await response.json()) as { items: { id: string }[] };
    const apiOrder = body.items.map((item) => item.id);

    // Everything shown must be in the API's own ordering, which is the same
    // `(createdAt, id)` sort the cursor walks.
    expect(all).toEqual(apiOrder.slice(0, all.length));
  });

  test('keeps the region applied while paging', async ({ page, request }) => {
    // `AdGrid` carries `region` from the page's `searchParams` prop
    // into the cursor request. If
    // it did not, "Load more" on a filtered view would append unfiltered ads --
    // mixing regions on a page whose whole point is that it is filtered, and
    // producing a grid that disagrees with both the URL and the API.
    const region = 'PR';

    await page.goto(`/?region=${region}`);

    const first = await cardIds(page);
    expect(first.length).toBeGreaterThan(0);

    const loadMore = loadMoreButton(page);

    // Given a real wait before deciding to skip. `isVisible()` on a control the
    // stream has not delivered yet answers "no", so the original `test.skip` here
    // skipped for a reason that had nothing to do with the data -- and a skipped
    // test reports green. Prague holds 15 ads, so a second page genuinely exists
    // and this should not skip at all.
    const hasSecondPage = await loadMore
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(
        () => true,
        () => false
      );

    test.skip(
      !hasSecondPage,
      `only one page of ads in ${region}, nothing to page`
    );

    expect(await loadAnotherPage(page, loadMore)).toBe(true);

    const all = await cardIds(page);
    expect(all.length).toBeGreaterThan(first.length);

    const inRegion = await everyIdInRegion(request, region);

    // Every ad on screen belongs to the region, not just the first page of them.
    // The earlier draft of this test asserted `allowed.has(id) || all.length >
    // inRegion.size`, which is true whenever the second clause holds and so
    // asserted nothing at all in exactly the case that mattered.
    for (const id of all) {
      expect(
        inRegion.has(id),
        `${id} is on a page filtered to ${region} but is not in ${region}`
      ).toBe(true);
    }
  });

  test('stops offering more once the last page is reached', async ({ page }) => {
    // `AdGrid` renders `LoadMoreButton` only while `hasMore` is true, so the
    // control disappearing is the end-of-list signal. Reaching the end of the
    // seeded set is the only way to see it, so this walks rather than jumps.
    await page.goto('/');

    const loadMore = loadMoreButton(page);

    // The walk cannot start until the control exists. Without this the loop reads
    // the button as absent on its first turn, breaks immediately, and the walk is
    // over before it began -- which then failed at the assertion below with one
    // button still on the page, the one the stream delivered a moment later.
    await expect(loadMore).toBeVisible();

    for (let click = 0; click < 40; click += 1) {
      if (!(await loadAnotherPage(page, loadMore))) break;
    }

    // Whatever the total, the run ends somewhere rather than offering a button
    // that never goes away.
    await expect(loadMore).toHaveCount(0);
  });
});
