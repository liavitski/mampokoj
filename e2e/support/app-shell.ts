import type { Locator, Page } from '@playwright/test';

/**
 * The layout shell every page renders inside.
 *
 * ## Why queries are scoped to this
 *
 * Next streams each route through a Suspense boundary, and while that is in
 * flight `document.body` holds **two copies of the page**: the real one inside
 * `MaxWidthWrapper`, and a bare `<div>` appended straight to `<body>` holding
 * the resolved content, waiting for an inline script to move it into place.
 *
 * Measured, not assumed -- `document.body.children` on first paint against a
 * production build:
 *
 *   DIV.MaxWidthWrapper   1 main, 10 ad links   <- the real page
 *   DIV                  1 main, 10 ad links   <- the streamed copy, not yet moved
 *
 * So an unscoped query reads 20 ad cards on a page that renders 10 and two
 * `<article>` elements on a detail page that has one. That produced a dozen
 * confident-looking failures against a correct app, in development *and* in a
 * production build.
 *
 * Waiting for the copy to disappear was tried first and is a bad idea: it races in
 * both directions. Before the copy is parsed the document looks settled, so a
 * wait can return early and the duplicate then appears; and after it appears a
 * count-based wait can pass on a moment when only one root is briefly present.
 * Both happened while writing this suite.
 *
 * Scoping is deterministic instead. The layout always wraps `children` in
 * `MaxWidthWrapper`, and the streamed copy is never moved inside it, so
 * "inside the layout shell" selects the real page whatever the stream is doing.
 *
 * The selector matches the styled-components *component prefix*, not a hashed
 * class: the hash changes when the styles change, the component name does not.
 */
const APP_SHELL = '[class*="MaxWidthWrapper"]';

/** The real page, excluding any streamed copy still awaiting relocation. */
export function appShell(page: Page): Locator {
  return page.locator(APP_SHELL).first();
}

/**
 * Waits until the grid inside the shell has arrived.
 *
 * Scoping to the shell removes the duplicate, but it does not remove the *wait*: the
 * shell exists from the first flush of the stream, long before `AdGrid` has
 * rendered. Reading a count in that window returns a partial grid, which is how two
 * of these specs came to fail intermittently -- once with every `main` count right
 * and the heading count at zero, because the shell had cards from an earlier flush
 * and none from the current one.
 *
 * `AdGrid` renders all its cards from one server component, so the grid is either
 * absent or complete: waiting for the first card to be visible is enough, and is
 * not a timeout in disguise the way a fixed sleep would be.
 */
export async function gridReady(page: Page): Promise<void> {
  await appShell(page)
    .locator('a[href^="/ad/"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * The hrefs of every ad card in the grid, in document order.
 *
 * Used instead of counting links anywhere on the page, which is what makes the
 * bounded-page assertion in `browse.spec.ts` mean something.
 */
export async function cardIds(page: Page): Promise<string[]> {
  await gridReady(page);

  return appShell(page)
    .locator('a[href^="/ad/"]')
    .evaluateAll((links) =>
      links.map((link) => (link.getAttribute('href') ?? '').replace('/ad/', ''))
    );
}

/** The card element, scoped to the real page. Works on `/` and `/ad/[adId]`. */
export function adCard(page: Page): Locator {
  return appShell(page).locator('article');
}