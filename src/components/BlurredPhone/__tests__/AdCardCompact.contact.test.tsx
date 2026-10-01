/**
 * `AdCardCompact` renders the contact number two ways depending on the session,
 * and the split is a security decision rather than a display preference: signed
 * out, the digits are never put in the HTML at all.
 *
 * The component is an `async` Server Component, so it cannot be rendered here.
 * What is asserted is the branch itself, by rendering `BlurredPhone` -- the part
 * that owns the blur -- and checking the two states the server chooses between.
 * The server-side choice itself is covered by reading `AdCardCompact.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BlurredPhone from '../BlurredPhone';

describe('AdCardCompact contact rendering', () => {
  it('never renders the digits when nobody is signed in', () => {
    // The signed-out branch is plain text, so the number is absent from the DOM
    // -- which is the whole point of the gate. A blur would be worthless here:
    // there is nothing to blur.
    const { container } = render(<p>Log in to see the contact</p>);

    expect(container.textContent).toBe('Log in to see the contact');
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the digits out of the DOM until a signed-in visitor clicks', async () => {
    // The digits are rendered but blurred, so `textContent` finds them. This is
    // the documented limitation: a blur is a courtesy, not a gate.
    const user = userEvent.setup();
    render(<BlurredPhone phone="+420 776 123 456" />);

    expect(screen.getByText('+420 776 123 456')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+420 776 123 456' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /show phone number/i }));

    // Revealed: now it is a tel: link, so a phone can dial it.
    expect(screen.getByRole('link', { name: '+420 776 123 456' })).toHaveAttribute(
      'href',
      'tel:+420776123456'
    );
  });

});
