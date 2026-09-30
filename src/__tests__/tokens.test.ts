// @vitest-environment node
/**
 * Every `var(--x)` in the app must name a custom property that something
 * actually defines.
 *
 * Two real bugs shipped through this gap. `Logo` read `var(--text-color)` when
 * the token is `--color-text`, and `Button`'s size config set `--fontSize`
 * while `ButtonBase` read `var(--font-size)`. Both are invisible: an
 * unresolved `var()` in a declaration makes that one declaration invalid at
 * computed-value time, and because both properties are inherited the element
 * silently keeps its parent's value. Nothing errors, nothing logs, and the
 * page looks fine until you look at the computed style.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIGHT_TOKENS, DARK_TOKENS } from '@/constants';

const SRC = fileURLToPath(new URL('..', import.meta.url));

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css'];

/**
 * Custom properties that no file in this repository declares, because they are
 * written into an element's inline style at runtime by something else. Each
 * entry says who, because an allowlist with no owner is how an allowlist rots.
 */
const DECLARED_ELSEWHERE: Record<string, string> = {
  '--font-sans': 'next/font/google, from `variable:` in src/utils/fonts.tsx',
  '--radix-toast-swipe-move-x': '@radix-ui/react-toast, during a swipe',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // This file, and every other test, must be excluded: they contain
    // `var(--x)` written to be wrong on purpose, in string form that a
    // mutation check writes and rewrites.
    if (entry === '__tests__' || entry === 'node_modules') continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);

/** Matches `var(--name`, including a fallback: `var(--name, red)`. */
const USED = /var\(\s*(--[a-zA-Z0-9-]+)/g;

/**
 * Matches a *declaration* of a custom property in any of the three spellings
 * this repo uses: `--x:` in a stylesheet, `'--x':` in a `constants.tsx`
 * object, and `'--x':` in an inline `style` object passed to React (React
 * writes those keys verbatim, so the quotes are part of the source only).
 */
const DECLARED = /['"]?(--[a-zA-Z0-9-]+)['"]?\s*:/g;

/**
 * Drops comments before scanning.
 *
 * This repository explains its own history in comments, and those comments
 * quote the declarations they replaced -- `height: var(--header-height)` was
 * the first thing written that way, and it made this test fail on a token that
 * has not existed for months. A comment cannot declare or resolve anything, so
 * removing them can only remove false positives.
 *
 * Block comments are stripped first because they contain `//` (a URL in the
 * reset's attribution link). Line comments are only stripped at the start of a
 * line, so that a `//` inside a string literal -- a URL, a path -- does not
 * truncate the rest of the line. A trailing comment after code is therefore
 * still scanned, which is the conservative direction.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function propertiesIn(source: string, pattern: RegExp): Set<string> {
  const found = new Set<string>();
  // `matchAll` needs a fresh lastIndex per call, hence the literal.
  for (const match of source.matchAll(pattern)) {
    found.add(match[1]);
  }
  return found;
}

describe('custom properties', () => {
  it('has source files to check, or the assertions below are vacuous', () => {
    // Guards the walk itself. If the glob or the directory moves, this fails
    // loudly instead of the two tests after it passing on an empty file list.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true);
    expect(files.some((f) => f.endsWith('constants.tsx'))).toBe(true);
  });

  it('every var() names a property that something declares', () => {
    const declared = new Set<string>(Object.keys(LIGHT_TOKENS));

    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const name of propertiesIn(source, DECLARED)) {
        declared.add(name);
      }
    }
    for (const name of Object.keys(DECLARED_ELSEWHERE)) {
      declared.add(name);
    }

    const unresolved = new Map<string, string[]>();

    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const [, name] of source.matchAll(USED)) {
        if (declared.has(name)) continue;
        const where = relative(SRC, file);
        unresolved.set(name, [...(unresolved.get(name) ?? []), where]);
      }
    }

    const report = [...unresolved.entries()]
      .map(
        ([name, where]) =>
          `  ${name}\n    used in: ${[...new Set(where)].join(', ')}`
      )
      .join('\n');

    expect(
      unresolved.size === 0 ? 'all resolved' : `unresolved:\n${report}`
    ).toBe('all resolved');
  });

  it('the light and dark themes define exactly the same properties', () => {
    // A property present in one theme and missing from the other resolves to
    // nothing under that theme and to a value under the other, which is a
    // layout bug in exactly one mode and very easy to ship.
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(
      Object.keys(LIGHT_TOKENS).sort()
    );
  });
});