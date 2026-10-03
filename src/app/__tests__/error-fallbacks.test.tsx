/**
 * The two error boundaries, and the one structural fact about the global one
 * that nothing else in the suite would catch.
 *
 * `error.tsx` is the boundary for every route below the root layout, so this is
 * the only thing a visitor sees when a page throws -- the built-in Next error
 * page is unstyled and has no way back into the site. `global-error.tsx` covers
 * the root layout itself, which is the one segment no `error.tsx` can wrap.
 *
 * Both are Client Components by requirement, so both are rendered here for real
 * rather than source-read. The `global-error.tsx` assertions are the reason this
 * file exists: it must render its own `<html>` and `<body>`, and omitting them
 * produces a fallback nested inside the existing document instead of replacing
 * it. That renders, it is reachable, and nothing warns you.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import userEvent from '@testing-library/user-event';

import { COLOR_THEME_COOKIE_NAME, DARK_TOKENS, LIGHT_TOKENS } from '@/constants';

import ErrorFallback, { type ErrorFallbackProps } from '../error';
import GlobalErrorFallback, {
  type GlobalErrorFallbackProps,
} from '../global-error';

/**
 * A server-side throw reaches the client with a generic message and a digest;
 * a client-side one arrives with its real message and no digest. Both shapes
 * occur in this app (a query in a server component vs. a render throw in
 * `AdGrid`), and the digest is the only thing that ties a user's report to a
 * log line -- so it must appear when there is one and must not be faked when
 * there is not.
 */
function serverErrorProps(overrides: Partial<ErrorFallbackProps> = {}) {
  return {
    error: Object.assign(new Error('Something went wrong'), { digest: 'a1b2c3' }),
    retry: vi.fn(),
    ...overrides,
  } satisfies ErrorFallbackProps;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the route error boundary', () => {
  it('tells the visitor what happened and offers a way back', async () => {
    render(<ErrorFallback {...serverErrorProps()} />);

    expect(
      screen.getByRole('heading', { name: /something went wrong/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries the segment when the button is used', async () => {
    const retry = vi.fn();
    render(<ErrorFallback {...serverErrorProps({ retry })} />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('logs the error, which is the only report this app produces', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { error } = serverErrorProps();

    render(<ErrorFallback {...serverErrorProps({ error })} />);

    expect(logged).toHaveBeenCalledWith(error);
  });

  it('shows the digest when there is one, so a report can be matched to a log', () => {
    render(<ErrorFallback {...serverErrorProps()} />);

    expect(screen.getByText('a1b2c3')).toBeInTheDocument();
  });

  /**
   * Without a digest the message is the client's own and is already shown to
   * the visitor, so printing an empty reference would be noise pretending to be
   * a reference.
   */
  it('shows no reference at all when the error carries no digest', () => {
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorFallback
        {...serverErrorProps({ error: new Error('client-side throw') })}
      />
    );

    expect(screen.queryByText(/a1b2c3/)).not.toBeInTheDocument();
    expect(console_).toHaveBeenCalled();
  });

  it('never renders the raw error message of a server-side throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const leaky = new Error('connection to table "ads" violated constraint');

    render(<ErrorFallback {...serverErrorProps({ error: leaky })} />);

    // In production the framework already replaces the message with a generic
    // one, so this asserts the component does not become the leak if a message
    // ever does arrive: the digest is the only identifier shown.
    expect(screen.queryByText(/violated constraint/)).not.toBeInTheDocument();
  });
});

describe('the global error boundary', () => {
  function globalProps(
    overrides: Partial<GlobalErrorFallbackProps> = {}
  ): GlobalErrorFallbackProps {
    return {
      error: Object.assign(new Error('root layout failed'), {
        digest: 'root99',
      }),
      retry: vi.fn(),
      ...overrides,
    };
  }

  /**
   * Rendered to static markup rather than mounted, and that is the point rather
   * than a limitation.
   *
   * This file's whole job is to *be* a document. Mounting it into jsdom's
   * `document.body` cannot express that -- React 19 hoists `<title>` out to the
   * real head and warns that `<html>` cannot be a child of a `<div>`, so a
   * mounted assertion about either is really an assertion about jsdom. The
   * string this returns is what the server sends, which is the thing that has
   * to contain `<html>` and `<body>`.
   */
  function renderDocument(overrides: Partial<GlobalErrorFallbackProps> = {}) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return renderToStaticMarkup(<GlobalErrorFallback {...globalProps(overrides)} />);
  }

  it('replaces the document, so it renders its own html and body', () => {
    const html = renderDocument();

    expect(html).toContain('<html');
    expect(html).toContain('<body');
    // And they wrap the message, rather than sitting beside it.
    expect(html).toMatch(/<body[^>]*>[\s\S]*Something went wrong[\s\S]*<\/body>/);
  });

  it('declares the document as Czech, like the root layout does', () => {
    expect(renderDocument()).toContain('lang="cs"');
  });

  it('carries a title, since an error boundary cannot export metadata', () => {
    expect(renderDocument()).toMatch(/<title>[^<]+<\/title>/);
  });

  /**
   * The root layout's inline `<html>` style is gone with the root layout, and
   * `error.md:165` is explicit that global-error does not inherit global styles
   * -- so the document this renders has neither the CSS variables nor
   * `data-color-theme`. The script that puts them back has to be inline in the
   * body: an external one cannot run before paint, which is the whole point.
   */
  /**
   * The tokens, painted by React rather than by a script.
   *
   * `useLayoutEffect` rather than `useEffect` because this runs before the
   * browser paints, which is the whole requirement: the point is that a
   * dark-theme visitor does not see a white page first. It does warn when
   * rendered on the server, so it is guarded -- harmless here, since the
   * boundary only ever reaches the browser.
   */
  describe('the theme it paints', () => {
    function paintTheme(cookie?: string) {
      const root = document.documentElement;
      root.removeAttribute('data-color-theme');
      root.removeAttribute('style');
      setCookie(cookie);

      render(<GlobalErrorFallback {...globalProps()} />);

      return root;
    }

    /** Every token, read back through the CSSOM and whitespace-normalised. */
    function tokensOnRoot() {
      const style = document.documentElement.style;
      return Object.fromEntries(
        Object.keys(LIGHT_TOKENS).map((key) => [
          key,
          style.getPropertyValue(key).replace(/\s+/g, ' ').trim(),
        ])
      );
    }

    function expected(tokens: Record<string, string>) {
      return Object.fromEntries(
        Object.entries(tokens).map(([key, value]) => [
          key,
          String(value).replace(/\s+/g, ' ').trim(),
        ])
      );
    }

    /**
     * jsdom's cookie jar is shared across every test in the file, so a cookie
     * set by one case is still there for the next. Assigning `''` is a no-op
     * rather than a delete, which is why deletion is explicit -- by expiring the
     * cookie in the past.
     */
    function setCookie(value: string | undefined) {
      document.cookie = `${COLOR_THEME_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

      if (value !== undefined) {
        document.cookie = `${COLOR_THEME_COOKIE_NAME}=${value}`;
      }
    }

    it('paints the dark tokens when the cookie says dark', () => {
      const root = paintTheme('dark');

      expect(tokensOnRoot()).toEqual(expected(DARK_TOKENS));
      expect(root.getAttribute('data-color-theme')).toBe('dark');
    });

    it('paints the light tokens when the cookie is absent', () => {
      const root = paintTheme();

      expect(tokensOnRoot()).toEqual(expected(LIGHT_TOKENS));
      expect(root.getAttribute('data-color-theme')).toBe('light');
    });

    /**
     * `layout.tsx` treats anything that is not exactly `'dark'` as light, so
     * a value of `'Dark'` has to land there too -- otherwise the error page and
     * the rest of the site disagree about which theme the visitor is on.
     */
    it('treats any other cookie value as light, exactly as the layout does', () => {
      const root = paintTheme('Dark');

      expect(root.getAttribute('data-color-theme')).toBe('light');
    });

    it('sets color-scheme, so the user agent paints its own widgets to match', () => {
      const root = paintTheme('dark');

      expect(root.style.colorScheme).toBe('dark');
    });

    /**
     * The two halves of the theming, which is where the real bug was.
     *
     * The body reads `var(--color-background)` and this effect is what defines
     * it. Either half alone is correct and the pair is what has to agree: a
     * token the effect never sets leaves the body resolving against nothing and
     * falling back to the browser's initial white.
     *
     * Asserted by checking that every token the document *reads* is one this
     * effect *writes*, rather than by comparing computed colours. jsdom does not
     * substitute custom properties in `getComputedStyle`, so a colour assertion
     * here would only pass by accident. Reading both sides out of the rendered
     * markup and the effect is what actually pins the contract.
     */
    it('defines every token the document reads', () => {
      const reads = new Set(
        [...renderDocument().matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1])
      );

      expect(reads.size).toBeGreaterThan(0);

      paintTheme('dark');

      for (const token of reads) {
        expect(
          document.documentElement.style.getPropertyValue(token),
          `${token} is read by the document but never defined`
        ).not.toBe('');
      }
    });
  });

  /**
   * The body colour reads the token rather than a literal from `LIGHT_TOKENS`.
   *
   * It was a literal, on the reasoning that the tokens are not defined yet when
   * React builds this markup. That was right for the inline-script version and
   * wrong now: a layout effect runs after the DOM is built and *before* the
   * browser paints, so the tokens are always defined by the time anything is
   * seen. Verified against a production build -- with a literal here, a
   * dark-theme visitor got a dark page on a light background.
   */
  it('reads its colours from the tokens the layout effect defines', () => {
    const html = renderDocument();

    expect(html).toContain('background:var(--color-background)');
    expect(html).toContain('color:var(--color-text)');

    // And no literals anywhere -- a hardcoded light value is exactly the bug
    // this replaced, and it would leave a dark-theme visitor with light text on
    // a dark page. Asserted across the whole document rather than per rule, so
    // a fourth hardcoded colour cannot be added without failing here.
    for (const token of Object.values(LIGHT_TOKENS)) {
      expect(html).not.toContain(String(token));
    }
    for (const token of Object.values(DARK_TOKENS)) {
      expect(html).not.toContain(String(token));
    }
  });

  it('carries no stylesheet link, which would 404 without a build manifest', () => {
    expect(renderDocument()).not.toContain('rel="stylesheet"');
  });

  /**
   * The regression this file was rewritten for.
   *
   * The theme tokens used to be applied by an inline `<script>` inside the
   * boundary, on the reasoning that a root-layout failure means nothing is
   * server-rendered, so React would never get to run it. That reasoning is
   * wrong in the way that matters: when the root layout throws during SSR,
   * Next serves a shell and renders `global-error.tsx` **on the client**, and
   * React does not execute `<script>` elements that appear in a component tree
   * at all. Confirmed against a production build -- the document arrived with
   * `data-color-theme` unset and `--color-background` undefined, and React
   * logged the warning itself.
   *
   * The failure is silent by construction: the page still renders, the body
   * colour still comes from the inline style below, and only a dark-theme
   * visitor notices anything -- after first paint. So the assertion is that no
   * script is emitted at all, since the mechanism cannot work here.
   */
  it('emits no script, because React will not run one from a component', () => {
    expect(renderDocument()).not.toContain('<script');
  });

  it('retries the segment when the button is used', async () => {
    const retry = vi.fn();
    render(<GlobalErrorFallback {...globalProps({ retry })} />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
