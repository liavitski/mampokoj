// @vitest-environment node

/**
 * `typedRoutes` is on, the pages take the generated route types, and the
 * difference is visible.
 *
 * **Why this file reads source rather than only rendering.** Every guarantee here
 * is a property of the *type-checker*, not of any runtime value: no `tsc` run can
 * be observed from inside a test, and a page that renders correctly today still
 * renders correctly with a hand-written `params` type in place of `PageProps`. A
 * test that rendered each page would pass identically before and after the
 * change, so it would prove nothing about the thing being shipped.
 *
 * So the assertions are on the declarations themselves, and each one is paired
 * with a note on what fails when it is not true. The mutation checks are the
 * important half and they are recorded in `todo.md` item 9: every case below was
 * verified to fail against a deliberately broken variant rather than being
 * written and assumed load-bearing.
 *
 * **Why these files and not others.** Every `page.tsx` and `layout.tsx` under
 * `src/app`, plus the three navigations `typedRoutes` actually bites on. The
 * list is derived from the filesystem so a new page cannot be added without
 * either appearing here or being deliberately excluded -- a hard-coded list of
 * four paths would quietly stop covering the fifth.
 */
import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const APP_DIR = join(process.cwd(), 'src/app');

/** Every `page.tsx` / `layout.tsx` in the app, route groups and slots included. */
async function routeFiles(name: 'page.tsx' | 'layout.tsx'): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        // `__tests__` holds test files, not routes.
        if (entry.name !== '__tests__') await walk(path);
      } else if (entry.name === name) {
        found.push(path);
      }
    }
  }

  await walk(APP_DIR);

  return found.sort();
}

/**
 * The route literal each file should declare, keyed by path relative to
 * `src/app`.
 *
 * Two of these are worth reading twice:
 *
 * - `@modal/(.)ad/[adId]/page.tsx` takes `PageProps<'/ad/[adId]'>`, **not** a
 *   route of its own. Neither `@modal` (a parallel-route slot) nor `(.)` (an
 *   intercept) appears in a URL, so the segment resolves to `/ad/[adId]`.
 *   Next's own generated `validator.ts` checks this file against
 *   `AppPageConfig<"/ad/[adId]">`, so anything else here contradicts the
 *   framework rather than the file.
 * - the root layout takes `LayoutProps<'/'>`, whose `LayoutSlotMap` supplies the
 *   `modal` key. That is the `@modal` directory showing up in a type, which is
 *   the reason to prefer the generated type over a hand-written one.
 */
const EXPECTED: Array<[string, string]> = [
  ['page.tsx', "PageProps<'/'>"],
  ['layout.tsx', "LayoutProps<'/'>"],
  ['ad/[adId]/page.tsx', "PageProps<'/ad/[adId]'>"],
  ['@modal/(.)ad/[adId]/page.tsx', "PageProps<'/ad/[adId]'>"],
  ['dashboard/[userId]/page.tsx', "PageProps<'/dashboard/[userId]'>"],
  ['moderation/page.tsx', "PageProps<'/moderation'>"],
];

describe('typedRoutes is enabled', () => {
  /**
   * The config line, and nothing more. `typedRoutes` is the switch that turns on
   * the `Route` type used by the assertions below -- with it off, `.next/types/
   * link.d.ts` is not generated at all and every `as Route` / `: Route`
   * annotation in the codebase becomes an unresolved name, so this file fails to
   * compile rather than quietly asserting nothing.
   *
   * Read from source rather than imported because `next.config.ts` is not a
   * module a test can import cleanly (it pulls in the Next.js config loader).
   */
  it('next.config.ts turns it on', async () => {
    const config = await readFile(join(process.cwd(), 'next.config.ts'), 'utf8');

    expect(config).toMatch(/typedRoutes:\s*true/);
  });

  /**
   * `tsconfig.json` already includes the generated `.next/types` and
   * `.next/dev/types` globs, which is what puts `PageProps`, `LayoutProps` and
   * `Route` in scope. The docs call this out as the step to perform by hand on a
   * project not created by `create-next-app` (`02-typescript.md`, "Good to
   * know" under Statically Typed Links), and it is the one part of this feature
   * that is invisible when it is missing: nothing errors, `PageProps` is just
   * `any`.
   */
  it('tsconfig includes the generated route types', async () => {
    const tsconfig = JSON.parse(
      await readFile(join(process.cwd(), 'tsconfig.json'), 'utf8')
    );

    expect(tsconfig.include).toContain('.next/types/**/*.ts');
  });
});

describe('every route takes the generated prop types', () => {
  it.each(EXPECTED)('%s declares %s', async (relativePath, helper) => {
    const source = await readFile(join(APP_DIR, relativePath), 'utf8');

    expect(source).toContain(helper);
  });

  /**
   * The absence, which is the half that actually matters.
   *
   * A file can satisfy the assertion above by mentioning `PageProps` in a comment
   * while still exporting a hand-written `type FooProps = { params: Promise<...> }`
   * -- and the hand-written one is what `tsc` would then check, because that is
   * the signature on the default export. Asserting that no `Promise<{` appears in
   * a props declaration is what closes that gap.
   *
   * The pattern is deliberately narrow: `opengraph-image.tsx` still declares its
   * own `params`, which is correct and not covered here, because an image route
   * is not a page and Next generates no `ImageProps` for it (verified -- there is
   * no such helper in `.next/types/routes.d.ts`, and `opengraph-image.md`
   * documents the inline `{ params: Promise<{ slug: string }> }` shape).
   */
  it.each(EXPECTED)('%s declares no hand-written props type', async (relativePath) => {
    const source = await readFile(join(APP_DIR, relativePath), 'utf8');

    expect(source).not.toMatch(/params:\s*Promise<\{/);
  });

  /**
   * Coverage of the list above, so it cannot rot. Reads the filesystem rather
   * than trusting the table: a sixth `page.tsx` appearing without an entry here
   * would fail this, which is the moment someone has to decide whether it takes
   * `PageProps` and why.
   *
   *
   * `loading.tsx` files are excluded because they receive no props at all, and
   * `not-found.tsx` / `error.tsx` for the same reason. The count is asserted
   * rather than the exact set, so a *removal* is also caught -- the modal page
   * going missing would otherwise leave this file green and `pnpm verify` failing
   * on an import nothing here mentions.
   */
  it('the expected list covers every page in the app', async () => {
    const pages = (await routeFiles('page.tsx')).map((path) =>
      path.slice(APP_DIR.length + 1)
    );
    const expected = EXPECTED.map(([relativePath]) => relativePath)
      .filter((path) => path.endsWith('page.tsx'))
      .sort();

    expect(pages.sort()).toEqual(expected);
  });

  it('the root layout is the only layout, and it takes the generated type', async () => {
    const layouts = await routeFiles('layout.tsx');

    expect(layouts.map((path) => path.slice(APP_DIR.length + 1))).toEqual([
      'layout.tsx',
    ]);
  });
});

describe('the navigations typedRoutes can check', () => {
  /**
   * `RegionNavigation`'s `href` is annotated `Route` rather than cast, and that
   * is the difference between a check and a decoration.
   *
   * TypeScript only forms a template literal type when there is a contextual one
   * to infer from, so an unannotated `` const href = `/?region=${region.code}` ``
   * widens to `string` and `router.push` rejects it. With the annotation,
   * `region.code` distributes over the fourteen literal codes from `CZ_REGIONS`
   * and each is checked against the generated `Route` union -- so renaming the
   * query parameter, or a code that stopped matching a route, fails to compile.
   *
   * Verified by mutation: dropping the `: Route` annotation reintroduces the
   * `router.push(href)` type error this replaced. Verified by widening:
   * `const href: Route = \`/?region=${region.code as string}\`` also fails,
   * because the union stops being literal.
   */
  it('the region links annotate href so all fourteen codes are checked', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/components/RegionNavigation/RegionNavigation.tsx'),
      'utf8'
    );

    expect(source).toContain('const href: Route = `/?region=${region.code}`');
    expect(source).not.toContain('href as Route');
  });

  /**
   * `RegionSelectBlock` casts to `RegionCode`, not to `Route`.
   *
   * The value comes from a Radix `onValueChange`, which is typed `(value: string)
   * => void` -- there is no way to narrow it, so some cast is unavoidable. What
   * is assertable is *which* cast: `RegionCode` is the fourteen-member union, so
   * the resulting `Route` annotation still checks every one of them, while
   * `as Route` on the finished string would silence `push` and check nothing.
   */
  it('the region select casts to the code union rather than to Route', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/components/RegionSelectBlock/RegionSelectBlock.tsx'),
      'utf8'
    );

    expect(source).toContain('`/?region=${value as RegionCode}`');
    expect(source).not.toMatch(/\$\{value\s+as\s+Route\}/);
  });

  /**
   * The one `as Route` that is genuinely unchecked, asserted so it stays visible.
   *
   * `typedRoutes` reaches `next/link` but not the styled-components wrapper
   * around it: `ControlLink = styled(Link)` still sees an interpolated string as
   * a plain `string`, so `/dashboard/${userId}` is rejected. Confirmed by
   * annotating a bare `styled(Link)` in a scratch file -- the unstyled `Link`
   * accepts the same template, the wrapped one does not.
   *
   * So this is a cast that checks nothing, and the comment at the call site says
   * so. It is listed here because a reader finding an `as Route` deserves to
   * find out which kind it is; if styled-components ever propagates the generic,
   * the cast becomes removable and this assertion is the thing that notices.
   */
  it('the header dashboard link is the one documented unchecked cast', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/components/Header/Header.tsx'),
      'utf8'
    );

    expect(source).toContain('href={`/dashboard/${userId}` as Route}');
    expect(source).toContain('styled-components');
  });

  /**
   * `AdSummaryCard` is the control: a *plain* `next/link` with an interpolated
   * dynamic segment, no cast and no annotation. If this ever grows an `as Route`,
   * `typedRoutes` has stopped reaching something it used to reach, which would
   * silently reduce the value of every other check in this file.
   *
   * Verified by mutation: `/ad/${id}` changed to `/adx/${id}` fails `tsc` at that
   * line, so the assertion above is backed by a real check rather than by the
   * type merely looking strict.
   */
  it('a plain Link with a dynamic segment needs no cast', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/components/AdSummaryCard/AdSummaryCard.tsx'),
      'utf8'
    );

    expect(source).toContain('href={`/ad/${id}`}');
    expect(source).not.toContain('as Route');
  });
});