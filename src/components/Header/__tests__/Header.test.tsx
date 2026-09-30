/**
 * The header is a server component and used to disagree with its own auth
 * button about whether anyone was signed in: it called `requireUserId()`, while
 * `AuthButton` called `useSession()` and rendered a spinner until that
 * resolved. So "My Ads" was in the SSR HTML immediately and the rest of the
 * right-hand side popped in afterwards, on every navigation.
 *
 * These assert the server session is the only input, and that the fix did not
 * trade the pop for a nameless control.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Session } from 'next-auth';

// If anything under this renders reaches for `useSession`, it is back to a
// second source of truth. Failing here names the component rather than
// letting it render a spinner and the test pass.
vi.mock('next-auth/react', () => ({
  useSession: () => {
    throw new Error(
      'useSession must not be used: the header is given the session by the server'
    );
  },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import Header from '../Header';

const session = (over: Partial<Session['user']> = {}): Session =>
  ({
    user: { id: 'user-1', name: 'Pavel', image: null, ...over },
    expires: '2099-01-01',
  }) as Session;

/** Every injected CSS rule whose selector mentions the element's classes. */
function rulesSelecting(element: Element): string[] {
  const classes = Array.from(element.classList);
  return Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return []; // a sheet jsdom cannot parse is not this component's
      }
    })
    .filter((rule) => classes.some((c) => rule.cssText.includes(`.${c}`)))
    .map((rule) => rule.cssText);
}

describe('Header', () => {
  it('renders the signed-out state with no session at all', () => {
    render(<Header initialTheme="light" session={null} />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my ads/i })).toBeNull();
  });

  it('renders the signed-in state straight from the session it was given', () => {
    // The assertion that matters: no spinner, no wait. The old implementation
    // rendered `<Spinner/>` here and only reached this markup after
    // hydration, which a component test cannot see but a user saw on every
    // page load.
    const { container } = render(
      <Header initialTheme="light" session={session()} />
    );

    expect(screen.getByRole('link', { name: /my ads/i })).toHaveAttribute(
      'href',
      '/dashboard/user-1'
    );
    expect(
      screen.getByRole('button', { name: /sign out/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Pavel')).toBeInTheDocument();

    // The spinner is a bare `<svg>` with no accessible name; assert none is
    // here rather than matching on a class, which would change on a rename.
    expect(container.querySelector('.Spinner-module__wrapper')).toBeNull();
  });

  it('gives every control an accessible name', () => {
    for (const s of [null, session()]) {
      const { unmount } = render(<Header initialTheme="light" session={s} />);

      const controls = [
        ...screen.getAllByRole('button'),
        ...screen.getAllByRole('link'),
      ];

      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const name =
          control.getAttribute('aria-label') ??
          control.textContent?.trim() ??
          '';
        expect(
          name,
          `control with no accessible name: ${control.outerHTML.slice(0, 120)}`
        ).not.toBe('');
      }

      unmount();
    }
  });

  it('keeps the header control names at the phone breakpoint', () => {
    // The test above is necessary and not sufficient: below 600px the labels
    // stop being visible while the icons stay `aria-hidden`, and jsdom does not
    // evaluate `@media`, so `getByRole(name)` sees the desktop rules and cannot
    // tell that the name survived. Swapping `clip-path` for `display: none`
    // would leave that test green and ship nameless buttons at the one width
    // where a screen reader user is relying on the name most.
    //
    // So this asserts the stylesheet itself: a rule that hides a name must hide
    // it by clipping it, never by removing it from the tree. It covers both
    // shapes the header uses -- the labels visible above 600px, and the theme
    // toggle's, which is never visible.
    render(<Header initialTheme="light" session={session()} />);

    for (const name of ['Sign out', 'Toggle dark / light mode']) {
      const rules = rulesSelecting(screen.getByText(name));

      expect(
        rules.length,
        `no rule found for the "${name}" label`
      ).toBeGreaterThan(0);

      const hides = rules.filter((rule) =>
        /clip-path|visibility\s*:\s*hidden|display\s*:\s*none/.test(rule)
      );

      if (hides.length === 0) {
        // A label that is visible at every width, like "Sign out" on a desktop
        // toolbar. Nothing to check.
        continue;
      }

      for (const rule of hides) {
        expect(rule, `"${name}" is removed from the tree by: ${rule}`)
          .toContain('clip-path');
      }
    }
  });

  it('keeps the theme toggle icon-only', () => {
    // The other direction, and the one that actually regressed while this was
    // being written: the toggle was given `ControlLabel`, the variant that is
    // visible on a desktop, so the header grew a visible sentence reading
    // "Toggle dark / light mode" next to a sun. Its name must be the variant
    // that is never visible.
    render(<Header initialTheme="light" session={session()} />);

    const name = screen.getByText('Toggle dark / light mode');
    const unconditional = rulesSelecting(name).filter(
      (rule) => !rule.startsWith('@media')
    );

    expect(
      unconditional.length,
      'the toggle label is not hidden at all widths'
    ).toBeGreaterThan(0);
    for (const rule of unconditional) {
      expect(rule).toContain('clip-path');
    }
  });

  it('does not link to the dashboard when the session has no user id', () => {
    // The two halves make different decisions here, on purpose. The link needs
    // an id to build `/dashboard/<id>`, so it is withheld; the auth button
    // asks whether there is a session at all, and there is, so "Sign out"
    // still has to be there -- otherwise a session that lost its id would
    // leave the header showing a login prompt to somebody who is signed in.
    render(
      <Header
        initialTheme="light"
        session={session({ id: undefined as unknown as string })}
      />
    );

    expect(screen.queryByRole('link', { name: /my ads/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: /sign out/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
  });
});