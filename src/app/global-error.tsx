'use client';

import * as React from 'react';
import {
  COLOR_THEME_COOKIE_NAME,
  DARK_TOKENS,
  LIGHT_TOKENS,
  WEIGHTS,
} from '@/constants';

/**
 * The error boundary for `src/app/layout.tsx` itself -- the one segment
 * `error.tsx` cannot wrap, because a boundary never covers the layout above it.
 *
 * What can fail in there: the `cookies()` read for the theme, `getCachedSession()`
 * for the header, `next/font`, and the UploadThing SSR plugin. All of those are
 * outside this app's control, which is exactly why this file cannot assume
 * anything the root layout would normally have provided.
 *
 * **This file replaces the document.** `error.md` is explicit that it renders
 * its own `<html>` and `<body>` and gets none of the app's global styles, and
 * three consequences follow, each one visible in the code below:
 *
 * 1. No styled-components. `StyledComponentsRegistry` lives in the root layout,
 *    which is exactly what has failed, so a styled rule would inject during the
 *    client pass with no SSR pass behind it. Hence `style={{}}` objects.
 * 2. No `next/font`. `utils/fonts.tsx` cannot be imported by a test (its
 *    loaders only run inside a Next build) and depending on a build-time
 *    stylesheet from the file that replaces the build's own document is the
 *    wrong side of that trade. A system font stack instead, which is also what a
 *    reader gets if the stylesheet never loads.
 * 3. No `metadata` export -- an error boundary is a Client Component, so the
 *    title is React's `<title>`, hoisted into the head.
 *
 * On the theme: `layout.tsx` paints the CSS variables and `data-color-theme`
 * onto `<html>` as a server-rendered inline style, and `error.md:165` says
 * plainly that none of that reaches here. So it is put back by a layout effect,
 * reading the same `color-theme` cookie `DarkLightToggle` writes.
 *
 * **A layout effect, and not an inline `<script>` -- which is what this did
 * first, and it silently did nothing.** The reasoning for the script was that a
 * root-layout failure means nothing is server-rendered, so React would never
 * execute a script in a component tree anyway. That is true, and it is the
 * problem: Next serves a shell and renders this boundary *on the client*, where
 * React does not run `<script>` elements at all. Verified against a production
 * build -- the document arrived with `data-color-theme` unset and
 * `--color-background` undefined, and React logged the warning itself. The page
 * still looked correct because of the inline `style` below, which is why this
 * could have shipped unnoticed.
 *
 * `useLayoutEffect` rather than `useEffect` because it has to run before paint,
 * or a dark-theme visitor gets a white flash on the one page least able to
 * afford one. It cannot be a `useState` initializer either: the server rendered
 * light, the client would render dark, and React would report a mismatch.
 */
export type GlobalErrorFallbackProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function GlobalErrorFallback({
  error,
  retry,
}: GlobalErrorFallbackProps) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  /**
   * Repaint `<html>` with the visitor's theme, since the server-rendered
   * inline style went down with the root layout.
   *
   * `typeof document` guard because `useLayoutEffect` warns when it runs on the
   * server. That cannot happen for this boundary -- it exists *because* the
   * layout failed -- but a warning printed on a page already handling a failure
   * would be the least useful thing on it, and the guard costs one line.
   */
  React.useLayoutEffect(() => {
    if (typeof document === 'undefined') return;

    applyThemeFromCookie(document);
  }, []);

  return (
    <html lang="cs" translate="no" suppressHydrationWarning>
      <head>
        {/* No `<link>` to the app's stylesheets, and that is deliberate rather
            than an oversight: this document is assembled outside a build that
            has necessarily failed, so a hashed asset URL is a guess. The
            inlined styles below are the whole stylesheet. */}
        <title>Chyba - Mam Pokoj</title>
      </head>
      <body style={BODY}>
        <main style={MAIN}>
          <h1 style={{ ...H1, fontWeight: WEIGHTS.bold, fontSize: '1.5rem' }}>
            Something went wrong.
          </h1>

          <p style={PARAGRAPH}>
            The site failed to start. This is a problem on our side, not with
            your device.
          </p>

          <button type="button" onClick={() => retry()} style={BUTTON}>
            Try again
          </button>

          {error.digest && (
            <code style={DIGEST}>{error.digest}</code>
          )}
        </main>
      </body>
    </html>
  );
}

/**
 * Paints the theme cookie's tokens onto `<html>`, the way `layout.tsx` does it
 * server-side.
 *
 * Token source and the `=== 'dark'` test are both shared with the layout by
 * importing them rather than copying, which is the reason this is a function
 * and not an inline script: the cookie is user-writable, so it has to be read
 * defensively, and a `try`/`catch` around the parse is far easier to write and
 * to read here than as a string.
 *
 * No `try`/`catch`, because there is nothing to go wrong: `document.cookie` is a
 * string, `split` cannot fail on it, and an unparseable value simply fails the
 * `=== 'dark'` comparison and lands on light. The one thing that could throw is
 * a token this app does not define, which is a build-time mistake and should
 * fail loudly.
 */
export function applyThemeFromCookie(doc: Document) {
  const name = `${COLOR_THEME_COOKIE_NAME}=`;
  const row = doc.cookie
    .split('; ')
    .find((part) => part.startsWith(name));
  const dark = row?.slice(name.length) === 'dark';
  const tokens = dark ? DARK_TOKENS : LIGHT_TOKENS;

  const root = doc.documentElement;

  root.setAttribute('data-color-theme', dark ? 'dark' : 'light');
  root.style.setProperty('color-scheme', dark ? 'dark' : 'light');

  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}

/**
 * The colours are read from the tokens rather than written as literals from
 * `LIGHT_TOKENS`, because the layout effect above defines them before the
 * browser paints. Hardcoding them was correct only for the inline-script version
 * that came first; with it, a dark-theme visitor got dark text and tokens on a
 * light background, which is worse than either theme being consistent.
 */
const BODY: React.CSSProperties = {
  margin: 0,
  background: 'var(--color-background)',
  color: 'var(--color-text)',
  // Not `var(--font-sans)`: next/font defines that, and its stylesheet belongs
  // to the build this boundary has just replaced.
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const MAIN: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '64px 16px',
  textAlign: 'center',
};

const H1: React.CSSProperties = {
  margin: 0,
  textAlign: 'center',
};

const PARAGRAPH: React.CSSProperties = {
  margin: 0,
  maxWidth: '44ch',
  fontSize: '1rem',
};

/**
 * Tokens for the same reason as `BODY`: a literal here would be a light-themed
 * button on a dark page, which is the mismatch this file already had once.
 * `--color-card-background` rather than `--color-background` so the button reads
 * as a surface against the page behind it, as it does in `error.tsx`.
 */
const BUTTON: React.CSSProperties = {
  padding: '12px 24px',
  border: '1px solid var(--color-text)',
  borderRadius: '4px',
  background: 'var(--color-card-background)',
  color: 'var(--color-text)',
  font: 'inherit',
  fontWeight: WEIGHTS.medium,
  cursor: 'pointer',
};

const DIGEST: React.CSSProperties = {
  fontSize: '0.75rem',
  opacity: 0.6,
};
