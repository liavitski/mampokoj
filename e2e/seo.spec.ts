import { expect, test } from '@playwright/test';

import { PAGE_SIZE } from '../src/constants';
import { appShell, gridReady } from './support/app-shell';

/**
 * What a crawler actually receives.
 *
 * The unit tests cover the *shape* of the metadata objects these routes export.
 * This file covers the thing those tests structurally cannot: the bytes Next.js
 * emits for them, after its own resolution of `metadataBase`, and the status
 * codes it chooses. A missing `metadataBase` or an unresolved relative URL is
 * invisible to a test that reads the exported object, because Next resolves both
 * at render time.
 *
 * Read-only against the shared database, like the rest of this suite: no ad is
 * created or deleted here.
 */
test.describe('metadata a crawler receives', () => {
  test('the home page carries a title, description and canonical', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Pokoj k pronájmu/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /České republice/
    );
    // `http://localhost:3000`, with no trailing slash. That is Next's
    // normalisation of a canonical of `/`, and it is correct -- so the
    // assertion is for the origin and the empty path rather than a literal
    // `/$` that would fail on a detail the platform owns.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /^https?:\/\/[^/]+$/
    );
  });

  test('the home page is indexable', async ({ page }) => {
    // The negative-space check. A stray `noindex` on the root layout would
    // deindex the whole site while every route-specific unit test passed, since
    // they assert what their own route declares rather than what it inherits.
    await page.goto('/');

    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('content') ?? ''));

    // Every directive on the page, not merely "no tag equal to `noindex`".
    //
    // The first version of this assertion was `not.toContain('noindex')`, which
    // passed against a build that *was* deindexing the whole site: the tag
    // rendered as `noindex, nofollow`, and only the literal comparison against
    // the single token `noindex` was doing any work. Each directive is now
    // required to permit indexing, which is what "indexable" means.
    for (const directive of robots) {
      expect(directive).toMatch(/(^|,\s*)index(\s*,|$)/);
      expect(directive).not.toContain('noindex');
    }
  });

  /**
   * Not an SEO assertion, and deliberately the only one here that is about the
   * streaming shape rather than the metadata.
   *
   * It is here because the structural change in this branch -- moving
   * `loading.tsx` off the app root so `/ad/[adId]` can answer a real 404 -- also
   * changes how the grid is streamed. `support/app-shell.ts` documents at
   * length that an unscoped query reads **two** copies of a page that is still
   * in flight, and that helper is what every other spec in this suite scopes
   * with. This asserts the invariant that helper depends on, so a future
   * streaming change that breaks it fails here with a clear cause instead of as
   * a dozen strict-mode violations elsewhere.
   */
  test('the home page is not streamed through a duplicate root', async ({ page }) => {
    await page.goto('/');
    await gridReady(page);

    // One layout shell. A second would be a streamed copy still awaiting its
    // inline relocation script.
    await expect(page.locator('[class*="MaxWidthWrapper"]')).toHaveCount(1);

    // Ten cards in the shell, and ten in the document: the grid is rendered
    // once. A streamed duplicate would make the document count twenty.
    await expect(appShell(page).locator('a[href^="/ad/"]')).toHaveCount(
      PAGE_SIZE
    );
    await expect(page.locator('a[href^="/ad/"]')).toHaveCount(PAGE_SIZE);
  });

  test('the document declares Czech, not English', async ({ page }) => {
    // `lang` drives screen-reader pronunciation and tells a search engine which
    // language the page is in. It was "en" on an app whose copy, currency and
    // dates are all Czech.
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  });

  test('the share card is populated', async ({ page }) => {
    await page.goto('/');

    // Both card formats: Facebook and LinkedIn read Open Graph, X reads
    // `twitter:card`. Setting one alone is how a link shares as a bare URL.
    await expect(
      page.locator('meta[property="og:title"]')
    ).toHaveAttribute('content', /.+/);
    await expect(
      page.locator('meta[property="og:description"]')
    ).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    );
  });

  test('a region page names its region and keeps it in the canonical', async ({ page }) => {
    await page.goto('/?region=PR');

    await expect(page).toHaveTitle(/Hlavní město Praha/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\?region=PR$/
    );
  });

  test('a paginated region page canonicalises to the first page', async ({ page }) => {
    // The infinite scroll's cursor must not reach the canonical: those URLs are
    // pages 2..n of one listing, and self-referencing all of them tells a
    // crawler they are distinct documents competing with each other.
    //
    // The canonical is read with an explicit wait. Metadata for a dynamic route
    // is resolved during the same render as the page, but the tag's arrival in
    // the DOM is not ordered against the browser's own readiness signal -- so
    // this is a wait for the element to exist, not a fixed sleep. (The first
    // version of this spec did not wait and failed intermittently, which is
    // what surfaced it.)
    // A real uuid for `cursorId`, because the page hands it to Postgres as one:
    // a non-uuid cursor 500s in the query, before any metadata is resolved, and
    // this spec would then be asserting on an error page. (That the cursor is
    // unvalidated is a separate pre-existing gap -- the 500 is a property of
    // `page.tsx`, not of the metadata.)
    const cursorId = crypto.randomUUID();

    await page.goto(
      `/?region=PR&cursorCreatedAt=2026-01-15T10:00:00.000Z&cursorId=${cursorId}`
    );

    const canonicalTag = page.locator('link[rel="canonical"]');
    await expect(canonicalTag).toHaveCount(1);

    const canonical = await canonicalTag.getAttribute('href');

    expect(canonical).toContain('region=PR');
    expect(canonical).not.toContain('cursor');
  });

  test('an ad page carries its own title and description', async ({ page }) => {
    await page.goto('/');

    const href = await appShell(page)
      .locator('a[href^="/ad/"]')
      .first()
      .getAttribute('href');

    await page.goto(href!);

    const title = await page.title();

    expect(title).not.toMatch(/^Mam Pokoj •?$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /.+/,
      { timeout: 5_000 }
    );
    expect(title).toMatch(/Mam Pokoj/);
  });

  test('an ad page publishes structured data with a price', async ({ page }) => {
    await page.goto('/');

    const href = await appShell(page)
      .locator('a[href^="/ad/"]')
      .first()
      .getAttribute('href');

    await page.goto(href!);

    const raw = await page
      .locator('script[type="application/ld+json"]')
      .textContent();

    expect(raw).toBeTruthy();

    const data = JSON.parse(raw!);

    expect(data['@context']).toBe('https://schema.org');
    expect(data.offers.priceCurrency).toBe('CZK');
  });

  /**
   * The structured data is served to the same anonymous visitor as the page, so
   * the ad's phone number must not appear in it either. The page-level check in
   * `ad-detail.spec.ts` asserts the number is absent from the response body;
   * this asserts the JSON-LD block specifically, because it is a separate
   * element with its own serialisation and its own escaping rules.
   */
  test('the structured data does not leak the contact number', async ({ page }) => {
    await page.goto('/');

    const href = await appShell(page)
      .locator('a[href^="/ad/"]')
      .first()
      .getAttribute('href');

    const response = await page.request.get(href!);
    const html = await response.text();

    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );

    expect(match).toBeTruthy();
    expect(match![1]).not.toMatch(/\+420\s?\d{3}\s?\d{3}\s?\d{3}/);
    expect(match![1]).not.toContain('tel:');
  });

  test('the 404 page is noindex, whatever Next tags it with', async ({ page }) => {
    // Asserted as a property of *every* robots tag rather than as a count.
    //
    // Next.js emits one from the 404 status (`noindex`) and one in the RSC
    // flight payload for the not-found boundary (`noindex, nofollow`), and the
    // browser renders both. Neither comes from this app's metadata exports --
    // declaring `robots` in `not-found.tsx` or in the ad page's
    // `generateMetadata` was tried and removed, because it only added a third.
    //
    // The count is therefore not the property worth asserting; the property is
    // that no directive on the page permits indexing. A count assertion would
    // fail on a correct page and pass on one whose tags disagreed.
    await page.goto(`/ad/${crypto.randomUUID()}`);

    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('content') ?? ''));

    expect(robots.length).toBeGreaterThan(0);
    for (const directive of robots) {
      expect(directive).toContain('noindex');
      expect(directive).not.toMatch(/(^|,\s*)index(\s*,|$)/);
    }
  });
});

test.describe('crawler-facing files', () => {
  test('robots.txt allows the site and disallows the private routes', async ({
    request,
  }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('User-Agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /dashboard/');
    expect(body).toContain('Disallow: /moderation');
    expect(body).toContain('Disallow: /api/');
  });

  test('robots.txt points at a sitemap on its own origin', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test('sitemap.xml lists the home page and every region', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();

    expect(body).toContain('<loc>');
    // 14 regions plus the home page, plus whatever ads exist.
    expect(body.match(/region=/g)?.length).toBe(14);
  });

  test('sitemap.xml serves absolute urls', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();

    // Every <loc> is absolute. A relative one is not a valid sitemap entry and
    // a crawler would discard the file.
    const locs = body.match(/<loc>[^<]*<\/loc>/g) ?? [];

    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc).toMatch(/<loc>https?:\/\//);
    }
  });

  test('sitemap.xml lists no private route', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();

    expect(body).not.toContain('/dashboard');
    expect(body).not.toContain('/moderation');
    expect(body).not.toContain('/api/');
  });

  test('sitemap.xml lists ad pages', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();

    // The seeded database holds generated ads, so this is non-empty in
    // practice. If the database were ever empty the assertion below would be
    // satisfied vacuously -- so it is stated rather than assumed.
    expect(body).toMatch(/\/ad\/[0-9a-f-]{36}/);
  });
});