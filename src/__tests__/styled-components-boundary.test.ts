// @vitest-environment node
/**
 * Every module that defines a styled-components rule must be a client module.
 *
 * This is not a style preference. styled-components generates a rule where the
 * component is *rendered*, and in the App Router that happens in one of two
 * places:
 *
 *   - a Client Component, during the client pass, where the rule is emitted
 *     into the document;
 *   - a Server Component, during the RSC pass, where the rule is written into
 *     the flight payload as a `<style>` React element and **never** reaches the
 *     document. Nothing recovers it either, because a Server Component does not
 *     re-render on the client, so there is no second chance to inject the CSS.
 *
 * So a styled component declared in a server module renders with a class name
 * and no CSS, permanently and silently. That is not theoretical: it shipped
 * here three times over. The logo had no `color` and no `font-size`, the header
 * had no `display: flex` so its contents stacked in a column, and
 * `MaxWidthWrapper` had no `max-width` so the page was never constrained or
 * centred. None of them threw, logged, or failed a build.
 *
 * `StyledComponentsRegistry` does not rescue this. Its `StyleSheetManager` only
 * wraps the client pass; the RSC pass never sees it.
 *
 * The rule is therefore mechanical: if a file calls `styled.*` or
 * `createGlobalStyle`, it needs `'use client'`. The one complication is that an
 * `async` Server Component cannot carry the directive, so those keep their
 * styled definitions in a sibling `*.styles.tsx` that does -- which is what
 * this file checks too.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Anything that would make a styled-components rule, on any import. */
const DEFINES_STYLES =
  /createGlobalStyle|styled\s*[.(]|styled\.[a-zA-Z]+\s*`|styled\([a-zA-Z]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC).filter(
  (f) => !f.includes(`${join('__tests__')}`) && basename(f) !== 'registry.tsx'
);

const offenders: string[] = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!DEFINES_STYLES.test(source)) continue;

  const isClient = /^'use client'/.test(source.trimStart());
  if (isClient) continue;

  // An async Server Component cannot hold the directive, so its rules are
  // allowed to live here -- provided they were moved into a sibling that does
  // have it. Naming matters: an arbitrary import path would let the styles sit
  // in a module nobody audits.
  const isAsyncComponent = /^export default async function/m.test(source);
  const sibling = basename(file).replace(/\.tsx?$/, '.styles.tsx');
  const siblingPath = join(file, '..', sibling);

  let siblingIsClient = false;
  try {
    siblingIsClient =
      /^'use client'/.test(readFileSync(siblingPath, 'utf8').trimStart());
  } catch {
    // no sibling; handled below
  }

  if (isAsyncComponent && siblingIsClient) continue;

  offenders.push(
    `${relative(SRC, file)}: defines styled-components rules${
      isAsyncComponent
        ? ` but is async, and ${sibling} is missing or is not a client module`
        : " without a 'use client' directive"
    }`
  );
}

describe('styled-components and Server Components', () => {
  it('finds the files to check, or the assertion below is vacuous', () => {
    // The walk is the assertion's only input. If the glob or the directory
    // moves, this fails loudly instead of the check below passing on nothing.
    expect(files.length).toBeGreaterThan(50);
    expect(
      files.some((f) => f.endsWith(join('layout.tsx')))
    ).toBe(true);
    expect(
      files.some((f) => f.endsWith(join('AdCard', 'AdCard.styles.tsx')))
    ).toBe(true);
  });

  it('every module that defines styles is a client module', () => {
    expect(
      offenders.length === 0 ? 'all client modules' : offenders.join('\n')
    ).toBe('all client modules');
  });
});