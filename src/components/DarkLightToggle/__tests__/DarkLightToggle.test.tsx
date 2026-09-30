/**
 * The toggle writes the theme three ways -- React state, a cookie, and the
 * `style` and `data-color-theme` attributes on `<html>` -- and only the state
 * one is covered by rendering. If the DOM half stops happening, the button
 * still flips its icon, the test still passes, and the page just does not
 * change colour.
 *
 * `layout.tsx` writes the same tokens as a server-rendered inline style, so
 * this is asserting the client is writing the same thing the server would.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LIGHT_TOKENS, DARK_TOKENS, COLOR_THEME_COOKIE_NAME } from '@/constants';

import DarkLightToggle from '../DarkLightToggle';

/** Stands in for the inline style `layout.tsx` renders on `<html>`. */
function paintInitialTheme(theme: 'light' | 'dark') {
  const tokens = theme === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
  const root = document.documentElement;
  root.setAttribute('data-color-theme', theme);
  root.style.colorScheme = theme;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value as string);
  }
}

/**
 * The values as they now sit on `<html>`, read back through the CSSOM.
 *
 * Whitespace is collapsed because the CSSOM does it: `--shadow-card` is a
 * multi-line box-shadow in `LIGHT_TOKENS`, and what comes back out is the same
 * declaration on one line. Comparing the raw strings would report a difference
 * that no browser can observe.
 */
function readTokens() {
  const style = document.documentElement.style;
  const out: Record<string, string> = {};
  for (const key of Object.keys(LIGHT_TOKENS)) {
    out[key] = style.getPropertyValue(key).replace(/\s+/g, ' ').trim();
  }
  return out;
}

/** `LIGHT_TOKENS` / `DARK_TOKENS` in the same normalised shape. */
function expectedTokens(tokens: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      key,
      value.replace(/\s+/g, ' ').trim(),
    ])
  );
}

describe('DarkLightToggle', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-color-theme');
    document.cookie = `${COLOR_THEME_COOKIE_NAME}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    paintInitialTheme('light');
  });

  it('writes the target theme onto <html>, not just its own state', async () => {
    const user = userEvent.setup();
    render(<DarkLightToggle initialTheme="light" />);

    expect(screen.getByText('Toggle dark / light mode')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    expect(document.documentElement.getAttribute('data-color-theme')).toBe(
      'dark'
    );
    expect(readTokens()).toEqual(expectedTokens(DARK_TOKENS));
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('carries `color-scheme` with the token swap', async () => {
    // Scrollbars, the native date picker and `::selection` read this, not the
    // tokens. It is set inline by `layout.tsx` and is not one of the tokens
    // the swap loop iterates, so it can be forgotten independently.
    const user = userEvent.setup();
    render(<DarkLightToggle initialTheme="light" />);

    await user.click(screen.getByRole('button'));
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.click(screen.getByRole('button'));
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(readTokens()).toEqual(expectedTokens(LIGHT_TOKENS));
  });

  it('writes the cookie the server reads on the next visit', async () => {
    const user = userEvent.setup();
    render(<DarkLightToggle initialTheme="light" />);

    await user.click(screen.getByRole('button'));

    expect(document.cookie).toContain(`${COLOR_THEME_COOKIE_NAME}=dark`);
  });

  it('leaves no token from the previous theme behind', async () => {
    // A token present in one theme and missing from the other resolves to
    // nothing, so a stale value would look like it worked. Every key of the
    // incoming set is asserted above; this catches the other direction, where
    // the outgoing set had a key the incoming one does not.
    const user = userEvent.setup();
    render(<DarkLightToggle initialTheme="light" />);

    await user.click(screen.getByRole('button'));
    const afterFirst = readTokens();
    await user.click(screen.getByRole('button'));

    expect(afterFirst).toEqual(expectedTokens(DARK_TOKENS));
    expect(readTokens()).toEqual(expectedTokens(LIGHT_TOKENS));
  });
});