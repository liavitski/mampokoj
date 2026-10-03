import { expect, test, type Locator, type Page } from '@playwright/test';

import { CZ_REGIONS } from '../src/constants';
import { appShell, cardIds, gridReady } from './support/app-shell';

/**
 * The region links, scoped to the layout shell.
 *
 * The navigation lives in the header, so it is *inside* `MaxWidthWrapper` and
 * inside the streamed duplicate alike. Unscoped it resolves to twice the regions,
 * which is how `CZ_REGIONS.length` came to be asserted against 28.
 */
function regionLinks(page: Page): Locator {
  return appShell(page).locator('nav a[href*="region="]');
}

/** One region's link, by code. */
function regionLink(page: Page, code: string): Locator {
  return appShell(page).locator(`nav a[href="/?region=${code}"]`);
}

/**
 * The region filter.
 *
 * Second on §2.1's priority list. The filter is a client-side `router.push` into
 * `?region=`, and the region is then re-read on the server -- so a bug here would
 * show ads from the wrong region rather than showing none, which is why the
 * assertions check *membership* and not just that something rendered.
 */
test.describe('region filter', () => {
  test('offers every region as a link', async ({ page }) => {
    await page.goto('/');

    // Derived from CZ_REGIONS rather than counted by hand, so adding a region
    // cannot leave the navigation quietly missing it.
    expect(await regionLinks(page).count()).toBe(CZ_REGIONS.length);
  });

  test('filters the grid to the chosen region', async ({ page, request }) => {
    const region = CZ_REGIONS.find((r) => r.code === 'PR')!;

    await page.goto('/');
    await gridReady(page);
    await regionLink(page, region.code).click();

    // The URL is the contract: the filter is a link, so it has to be linkable,
    // shareable and survivable on reload.
    await expect(page).toHaveURL(new RegExp(`\\?region=${region.code}`));

    const fromPage = await cardIds(page);

    const response = await request.get(`/api/ads?region=${region.code}`);
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { items: { id: string }[] };

    // Same membership as the filtered endpoint, so the page is not quietly
    // showing everything while the URL claims a region.
    expect(fromPage).toEqual(body.items.map((item) => item.id));
  });

  test('keeps the chosen region marked as current', async ({ page }) => {
    // `RegionNavigation` takes `currentRegion` and styles the active entry. Losing
    // it leaves a filter that works with no indication of what is applied.
    const region = CZ_REGIONS.find((r) => r.code === 'PR')!;

    await page.goto(`/?region=${region.code}`);

    const active = regionLink(page, region.code);
    await expect(active).toBeVisible();

    // Compared against a *different* region, chosen explicitly. The obvious
    // `nav a[href*="region="]).first()` is Prague -- which is the region under
    // test -- so the comparison would be the active link against itself and would
    // pass only if the styling were removed entirely.
    const other = CZ_REGIONS.find((r) => r.code !== region.code)!;
    const inactive = regionLink(page, other.code);
    await expect(inactive).toBeVisible();

    // The active link is distinguished by colour, so this asserts the styled
    // component received the prop rather than reading a CSS value that a theme
    // change could alter.
    const color = await active.evaluate((el) => getComputedStyle(el).color);
    const otherColor = await inactive.evaluate((el) => getComputedStyle(el).color);

    expect(color).not.toBe(otherColor);
  });

  test('refuses a region that does not exist', async ({ page }) => {
    // `isRegionCode` guards the query parameter, and an unknown value is rendered
    // as an explicit refusal rather than as the unfiltered grid. A bad region
    // silently falling back to "all ads" would look like the filter working.
    await page.goto('/?region=NOT_A_REGION');

    await expect(page.getByText('No ads found for this region')).toBeVisible();
    await expect(appShell(page).locator('a[href^="/ad/"]')).toHaveCount(0);
  });

  test('survives a reload on a filtered URL', async ({ page }) => {
    // The filter is server-read on every request, so a reload must not lose it.
    // Compared by ad id rather than by count: a count would also pass if the
    // reload silently widened the filter to every region and happened to return
    // the same number of ads.
    const region = CZ_REGIONS.find((r) => r.code === 'PR')!;

    await page.goto(`/?region=${region.code}`);
    const before = await cardIds(page);

    await page.reload();
    const after = await cardIds(page);

    expect(after).toEqual(before);
  });
});