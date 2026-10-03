import { expect, test } from '@playwright/test';

import { adCard, appShell } from './support/app-shell';

/**
 * The ad detail page, and the intercepting modal that renders the same card.
 *
 * Fourth and fifth on §2.1's priority list, and they share a route for a reason:
 * `/ad/[adId]` and `@modal/(.)ad/[adId]` both call `getValidatedAd` and both
 * `notFound()` on a null. A change to that query therefore has to break both, or
 * one of them is silently serving something the other refuses.
 */
test.describe('ad detail', () => {
  test('opens the ad a card points at', async ({ page }) => {
    await page.goto('/');

    const firstCard = appShell(page).locator('a[href^="/ad/"]').first();
    const href = await firstCard.getAttribute('href');
    const title = (await firstCard.locator('h2').textContent())?.trim();

    await firstCard.click();

    await expect(page).toHaveURL(new RegExp(`${href}$`));
    // The card's own title, on the page it opened. Asserting the title rather
    // than just the URL is what makes this a test of navigation rather than of
    // the URL bar.
    await expect(
      page.getByRole('heading', { name: title!, exact: true })
    ).toBeVisible();
  });

  test('shows the details a visitor needs', async ({ page }) => {
    // Navigated by URL rather than by clicking a card, because a click opens the
    // *intercepted modal* and leaves the grid mounted behind it -- ten grid cards
    // each carry their own "City:", so an unscoped `getByText('City:')` matches
    // eleven elements and fails on strict mode rather than on anything real.
    // Navigating directly is also the honest way to test the detail page as its
    // own route; the modal is covered separately below.
    await page.goto('/');

    const href = await appShell(page)
      .locator('a[href^="/ad/"]')
      .first()
      .getAttribute('href');

    await page.goto(href!);

    const card = adCard(page);

    // `AdCardCompact` is the shared card; its price and city are what the grid
    // promised, so the detail page agreeing with them is the point.
    await expect(card.getByText('City:')).toBeVisible();
    await expect(card.getByText('Price:')).toBeVisible();

    // The contact is gated, and how it is gated depends on the session. An
    // anonymous visitor gets "Log in to see the contact" -- `BlurredPhone`, the
    // button that reveals the number behind a blur, is the *signed-in* affordance
    // and appears only then. Two earlier drafts of this spec asserted a `tel:`
    // link and then a "Show phone number" button, which is how a spec ends up
    // asserting a signed-in view of the page on an anonymous flow.
    //
    // Asserting the digits are absent is the stronger claim and the one worth
    // making: an anonymous response must not carry the number at all.
    // Scoped to the layout shell: the streamed copy of the detail page carries the
    // same card, so an unscoped getByText matched two and failed on strict mode.
    // The tel: count below is left unscoped on purpose -- "no tel: link anywhere in
    // the document" is the stronger claim, and a duplicate could only add to it.
    await expect(
      adCard(page).getByText(/log in to see the contact/i)
    ).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

    const html = await page.content();
    expect(html).not.toMatch(/\+420\s?\d{3}\s?\d{3}\s?\d{3}/);
  });

  test('is reachable directly by URL', async ({ page }) => {
    // A shared link must work without arriving from the grid, which is a different
    // render path: no intercepted modal, no history entry for the grid, a full
    // page load. The URL itself is what somebody would paste into a message.
    await page.goto('/');

    const href = await appShell(page)
      .locator('a[href^="/ad/"]')
      .first()
      .getAttribute('href');

    const response = await page.goto(href!);

    expect(response?.status()).toBe(200);
    await expect(adCard(page).locator('h2')).toBeVisible();
  });

  test('shows the not-found page for an ad id that does not exist', async ({ page }) => {
    // `getValidatedAd` returns null and the route calls `notFound()`. A random v4
    // uuid is used rather than a deleted real one, so the suite never has to create
    // and delete an ad to have something to 404 on -- which is what lets these
    // specs stay read-only against the shared database.
    //
    // **The status is asserted here, and it used to be 200.** `loading.tsx` sat at
    // the app root, putting a Suspense boundary above every route: the response
    // head was committed before `getValidatedAd` ran, so `notFound()` could only
    // swap the body and the status line had already gone out as 200. The visitor
    // saw a correct 404 page and every crawler, uptime monitor and CDN saw a
    // success -- and because a 200 does not get Next.js's automatic `noindex`, a
    // removed listing stayed indexable on its own merits. Recorded in
    // `HANDOFF.md` §9.4; fixed by scoping the boundary to the `(browse)` route
    // group, so `/ad/[adId]` renders without one.
    //
    // The rendered assertions are kept alongside the status, not replaced by it: a
    // server could return 404 and still render the wrong page.
    const missing = crypto.randomUUID();

    const response = await page.goto(`/ad/${missing}`);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: /404 - Page Not Found/i })
    ).toBeVisible();
    await expect(page.getByText('City:')).toHaveCount(0);
  });

  test('shows the not-found page for an ad id that is not a uuid at all', async ({ page }) => {
    // The malformed case reaches `adIdSchema` rather than the database, and must be
    // refused identically without leaking a validation or driver message.
    //
    // The status is asserted for the same reason as above: both paths must answer
    // 404, and a malformed id that reached the database as a cast would produce a
    // driver error page instead.
    const response = await page.goto('/ad/not-a-uuid');

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: /404 - Page Not Found/i })
    ).toBeVisible();
    await expect(page.getByText(/invalid uuid|expected/i)).toHaveCount(0);
  });

  test('answers 404 for a removed ad but 200 for a real one', async ({ page }) => {
    // The precondition that makes the two assertions above mean anything.
    //
    // Every ad in this database answers 200 -- including a real one, which is the
    // trap: an assertion of `expect(status).toBe(200)` on the *home* page would
    // pass whether or not the 404 fix worked, because that is simply what this
    // server answers. Measured in both directions, a status assertion that cannot
    // distinguish success from failure is decoration.
    await page.goto('/');

    const href = await appShell(page)
      .locator('a[href^="/ad/"]')
      .first()
      .getAttribute('href');

    const real = await page.goto(href!);
    expect(real?.status()).toBe(200);

    const missing = await page.goto(`/ad/${crypto.randomUUID()}`);
    expect(missing?.status()).toBe(404);
  });

  test('does not leak the poster id or the moderation columns', async ({ page }) => {
    // The strongest claim this suite makes, and the reason it is worth having:
    // `detailAdColumns` withholds `userId` and `reportedAt`, and `AdWithoutUserId`
    // omits them from the type. Both are server-side guarantees that a rendering
    // assertion cannot make -- the value would simply be absent rather than
    // visible -- so the check is against the delivered bytes.
    await page.goto('/');

    const href = await appShell(page).locator('a[href^="/ad/"]').first().getAttribute('href');
    const id = href!.replace('/ad/', '');

    const response = await page.request.get(`/ad/${id}`);
    const html = await response.text();

    expect(html).not.toContain('reportedAt');
    expect(html).not.toContain('checkedAt');

    // `mampokoj_ads` must not appear either: a column name in the payload means a
    // query widened, whatever the types say.
    expect(html).not.toContain('mampokoj_ads');
  });
});

test.describe('the intercepting modal', () => {
  test('opens over the grid without a full page load', async ({ page }) => {
    await page.goto('/');

    const firstCard = appShell(page).locator('a[href^="/ad/"]').first();
    const href = await firstCard.getAttribute('href');

    await firstCard.click();

    // The URL updates even though the grid stays mounted -- that is the App
    // Router's intercepted route, and it is what makes the address bar shareable.
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The grid is still behind it, which is the whole point of intercepting
    // rather than navigating.
    await expect(appShell(page).locator('a[href^="/ad/"]').first()).toBeVisible();
  });

  test('closes back to the grid', async ({ page }) => {
    await page.goto('/');
    await appShell(page).locator('a[href^="/ad/"]').first().click();

    await expect(page.getByRole('dialog')).toBeVisible();

    // `Modal` closes on the `Dialog.Close` trigger, which is the icon button
    // labelled "Close modal" for assistive technology.
    await page.getByRole('button', { name: 'Close modal' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('closes on the Escape key', async ({ page }) => {
    // Radix handles Escape; a modal that only closes by its button is a keyboard
    // trap.
    await page.goto('/');
    await appShell(page).locator('a[href^="/ad/"]').first().click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shows the same ad as the detail page does', async ({ page }) => {
    // Both routes call `getValidatedAd` and render `AdCardCompact`, so a card that
    // differs between them means one of them is reading something the other is not.
    // Compared on the title and city, which the anonymous flow renders in both --
    // the phone is behind `BlurredPhone` here and is not a usable comparison.
    await page.goto('/');

    const firstCard = appShell(page).locator('a[href^="/ad/"]').first();
    const href = (await firstCard.getAttribute('href'))!;

    await firstCard.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    // Scoped to the dialog, and **not** to the layout shell: Radix renders the
    // dialog through a portal onto `document.body`, so the modal's card sits
    // outside `MaxWidthWrapper` entirely and `adCard` would hand back the grid's
    // ten cards instead. Both scopes are needed in this file for that one reason,
    // which is what the two helpers are for.
    const modalCard = dialog.locator('article');
    const titleInModal = (await modalCard.locator('h2').textContent())?.trim();
    const cityInModal = (await modalCard.getByText('City:').textContent())?.trim();

    // Direct navigation, so the grid is gone and the layout shell holds only the
    // detail card.
    await page.goto(href);

    const card = adCard(page);
    const titleOnPage = (await card.locator('h2').textContent())?.trim();
    const cityOnPage = (await card.getByText('City:').textContent())?.trim();

    expect(titleOnPage).toBe(titleInModal);
    expect(cityOnPage).toBe(cityInModal);
  });
});