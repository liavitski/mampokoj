// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

const { default: Loading } = await import('@/app/moderation/loading');

const html = renderToStaticMarkup(<Loading />);

/**
 * `/moderation`'s loading state.
 *
 * This route is two database reads behind a session read and a moderator
 * allowlist check, so without a boundary a client navigation to it blocks on the
 * whole page with nothing on screen — on the one page where a moderator is
 * already waiting to do something.
 *
 * **The constraint on the ad route is asserted in `noindex-private-routes.test.ts:164`,
 * not here.** `loading.tsx` is not free: `loading.md:101-122` says a Suspense
 * fallback starts the response stream, which commits the status line as 200
 * before the page's own data has loaded, so a later `notFound()` cannot change
 * it. That is the defect HANDOFF §9.4 records, and it is why `/ad/[adId]` must
 * have no loading boundary at all. One owner per invariant — a second copy of
 * that assertion here would be free to drift out of agreement with the real one.
 *
 * `/moderation` can have one because it never throws `notFound()` or
 * `redirect()` — asserted below, so the day someone adds a `notFound()` to this
 * route the safe version of this file stops being safe.
 *
 * **What these tests cannot establish**, stated so nobody reads green as proof:
 * that a moderator *sees* the skeleton. Every test here imports `loading.tsx`
 * directly, so a file that Next never wires still passes all of them. The wiring
 * is the framework's, the reachability is the last test's, and the appearance was
 * confirmed by hand. An e2e test is not the answer — `/moderation` gates on the
 * moderator allowlist and this suite is anonymous and read-only by design
 * (`playwright.config.ts` §2.1), so it could only ever reach the refusal path.
 * Real browser coverage needs signed-in moderator access and a disposable
 * database, which is the gap §2.1 already names.
 */
describe('the moderation loading state', () => {
  it('exists', () => {
    expect(existsSync(join(process.cwd(), 'src/app/moderation/loading.tsx'))).toBe(
      true
    );
  });

  /**
   * The one thing the tests above cannot see: that Next wires this file to this
   * page.
   *
   * `loading.tsx` only becomes a Suspense boundary when it sits in the **same
   * route segment** as the `page.tsx` it fronts — same directory. Move it up to
   * `src/app/loading.tsx` and it wraps the whole app; leave it behind when
   * `page.tsx` moves and it wraps nothing at all. Both failures are silent: the
   * module still compiles, still exports a component, and still passes every
   * import-based test in this file, because importing a component says nothing
   * about whether the router will ever render it.
   *
   * The first of those two is not hypothetical here. `src/app/loading.tsx` is what
   * caused the §9.4 soft-404 before it was scoped into `(browse)`, and
   * `noindex-private-routes.test.ts:121` is the guard for it — which is exactly
   * why this file does not repeat that assertion and checks only what is unique
   * to this route.
   */
  it('sits in the same directory as the page it fronts', () => {
    const loadingDir = dirname(fileURLToPath(import.meta.url)) + '/..';

    expect(dirname(resolve(loadingDir, 'loading.tsx'))).toBe(
      dirname(resolve(loadingDir, 'page.tsx'))
    );
  });

  /**
   * And with no route group in between.
   *
   * A group adds no URL segment but it *is* a segment, so `moderation/(queue)/page.tsx`
   * with `moderation/loading.tsx` left above it would still be two segments apart
   * and still render no fallback. This is the same mechanism that broke the
   * intercepting modal when the home page moved into `(browse)`: `(.)ad` stopped
   * resolving because the page was one route-group level deeper, and the only
   * symptom was a client navigation that became a full page load.
   */
  it('has no route group between it and the page', () => {
    const entries = readdirSync(join(process.cwd(), 'src/app/moderation'), {
      withFileTypes: true,
    });

    // Only a parenthesised name is a route group. `__tests__` is also a
    // directory and is deliberately not matched: Next.js builds a route segment
    // from the route files a directory holds, and a test directory holds none,
    // so it is invisible to the router. Asserting "no directories" would have
    // failed on the very convention this project uses everywhere.
    const groups = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\(.*\)$/.test(name));

    expect(groups).toEqual([]);
  });

  /**
   * A skeleton of silent grey boxes tells a screen-reader user nothing at all,
   * which is the whole point of not showing them one: the fallback has to say
   * what is being waited for. `role="status"` is what makes it announced rather
   * than merely present.
   */
  it('announces itself as a live region', () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('says what is loading, in text rather than in shape', () => {
    // Not asserted as an exact string: the wording is free to change, the fact
    // that there is wording is not.
    expect(html).toMatch(/Loading[^<]*/i);
  });

  /**
   * The placeholder bars are decorative, and a screen reader that walks the list
   * would otherwise announce six empty list items before the real content
   * arrives. Hidden, with the sentence above as the only thing read.
   */
  it('hides the placeholder bars from assistive technology', () => {
    expect(html).toContain('aria-hidden="true"');
  });

  /**
   * The headings are static text, so they are rendered for real rather than
   * greyed out — `loading.md:50` calls this the "small but meaningful part of
   * future screens". A moderator arriving here learns which page is loading
   * before any row does, and the swap does not shift the layout under them
   * because the fallback and the page share `Wrapper`, `Heading` and
   * `SectionHeading`.
   */
  it('renders the static headings, not placeholders for them', () => {
    expect(html).toContain('Moderation');
    expect(html).toContain('Reported ads');
    expect(html).toContain('All ads');
  });

  /**
   * Both columns, in the page's own order, so the two-column grid has something
   * in each cell. One filled column and one empty one is a layout the fallback
   * invents and then has to take back.
   */
  it('skeletons both sections', () => {
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * The precondition, asserted so it cannot be broken silently.
   *
   * Comments are stripped before the check because this file's own prose in
   * `page.tsx` names both functions while explaining why it calls neither — a
   * naive substring search would read that paragraph as an import.
   */
  it('the route it fronts still cannot throw notFound() or redirect()', async () => {
    const source = await readFile(
      new URL('../page.tsx', import.meta.url),
      'utf8'
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/\bnotFound\b/);
    expect(code).not.toMatch(/\bredirect\b/);
  });
});