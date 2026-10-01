/**
 * The contact number is blurred until the reader asks for it.
 *
 * The digits are already gated on a session, and this adds the second half of
 * that: a signed-in visitor can see that a number exists without reading it off
 * someone else's screen, and reveals it deliberately.
 *
 * **This is not a security boundary.** The digits are in the HTML either way --
 * `getValidatedAd` selects the column and the server renders it -- so view-source
 * or devtools shows the number unblurred. It deters shoulder-surfing and casual
 * scraping, nothing more. A real gate would withhold the value server-side and
 * return it from a rate-limited action, which is a different feature with an
 * abuse story attached; see handoff.md.
 *
 * State is local and deliberately not shared: the modal remounts per ad, so
 * revealing a number on one listing does not leave the next one revealed.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BlurredPhone from '../BlurredPhone';

const PHONE = '+420 776 123 456';

describe('BlurredPhone', () => {
  it('renders the digits blurred, not hidden', () => {
    render(<BlurredPhone phone={PHONE} />);

    // Blurred, not absent: the number is genuinely in the DOM, which is why the
    // comment above insists this is not a security boundary.
    const digits = screen.getByText(PHONE);

    expect(digits).toBeInTheDocument();
    expect(getComputedStyle(digits).filter).toBe('blur(6px)');
  });

  it('says what clicking will do, for anyone who cannot see the digits', () => {
    render(<BlurredPhone phone={PHONE} />);

    // The accessible name has to work when the digits themselves are blurred. The
    // digits are aria-hidden, so without a label this button would be announced
    // as an unlabelled control.
    const button = screen.getByRole('button', { name: /show phone number/i });

    expect(button).toBeInTheDocument();
    // And the digits must be hidden from assistive technology, or the number is
    // read twice: once as the name and once as the blurred contents.
    expect(screen.getByText(PHONE)).toHaveAttribute('aria-hidden', 'true');
  });

  it('reveals the number on click and drops the blur', async () => {
    const user = userEvent.setup();
    render(<BlurredPhone phone={PHONE} />);

    expect(getComputedStyle(screen.getByText(PHONE)).filter).toBe('blur(6px)');

    await user.click(screen.getByRole('button'));

    expect(getComputedStyle(screen.getByText(PHONE)).filter).toBe('none');
  });

  it('stops offering to reveal once revealed', async () => {
    const user = userEvent.setup();
    render(<BlurredPhone phone={PHONE} />);

    await user.click(screen.getByRole('button'));

    // Not a toggle: a second click must not re-hide the number, or a user
    // reaching for it twice loses it again.
    expect(
      screen.queryByRole('button', { name: /show phone number/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(PHONE)).toBeVisible();
  });

  it('renders a plain number with no control when there is nothing to hide', () => {
    // An empty string would otherwise produce a button labelled "show phone
    // number" that reveals nothing.
    render(<BlurredPhone phone="" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
