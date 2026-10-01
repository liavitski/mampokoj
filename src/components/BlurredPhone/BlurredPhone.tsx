'use client';

import * as React from 'react';
import styled from 'styled-components';

import UnstyledButton from '@/components/UnstyledButton';

type BlurredPhoneProps = {
  /** Already formatted for display. Empty renders plain text, not a control. */
  phone: string;
};

/**
 * A phone number behind a blur, revealed by a click.
 *
 * Blurred rather than hidden: the digits are in the HTML either way, because the
 * server rendered them, so this is about not reading a stranger's number off
 * their screen. The comment in `__tests__` says the same thing at more length.
 *
 * A button rather than a `<span onClick>` so it is reachable by keyboard and
 * announced as something actionable. Once revealed it stops being a button
 * entirely -- there is nothing left to do to it, and leaving a live control
 * labelled "show phone number" around would be a lie.
 */
function BlurredPhone({ phone }: BlurredPhoneProps) {
  const [revealed, setRevealed] = React.useState(false);

  if (!phone) return <Digits $blurred={false}>{phone}</Digits>;

  if (revealed) {
    return (
      <Digits $blurred={false}>
        <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
      </Digits>
    );
  }

  return (
    <RevealButton
      type="button"
      onClick={() => setRevealed(true)}
      // The digits are visible to a sighted reader but blurred, so they are
      // hidden from assistive technology and the name below carries the meaning
      // instead. Without this a screen reader would read the number twice: once
      // as the button name and once as its blurred contents.
      aria-label="Show phone number"
    >
      <Digits $blurred aria-hidden="true">
        {phone}
      </Digits>
      <Hint>Show</Hint>
    </RevealButton>
  );
}

/**
 * The blur itself, on a child rather than the control.
 *
 * `filter: blur` on the button would blur the "Show" hint and the focus ring
 * with it, so only the digits are filtered.
 */
/*
  A transient prop, not `data-blurred`. styled-components v6 filters props on
  DOM elements through is-prop-valid, and the `data-` attribute was silently
  dropped from the rendered span -- so the interpolation read `undefined`, took
  the revealed branch, and the number came out unblurred with the test green.
  A `$` prefix is never forwarded to the DOM and always reaches the rule.
*/
const Digits = styled.span<{ $blurred: boolean }>`
  filter: ${({ $blurred }) => ($blurred ? 'blur(6px)' : 'none')};
  /* Keeps the blurred glyphs from bleeding past the end of the number. */
  padding: ${({ $blurred }) => ($blurred ? '0 2px' : '0')};
  user-select: ${({ $blurred }) => ($blurred ? 'none' : 'auto')};
  transition: filter 150ms ease-out;
`;

const RevealButton = styled(UnstyledButton)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  /* The digits are the blurred thing, so the button is sized to them plus the
     hint rather than to the hint alone. */
`;

const Hint = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-muted-foreground);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 1px 6px;
  white-space: nowrap;

  @media (hover: hover) and (pointer: fine) {
    ${RevealButton}:hover & {
      background-color: var(--color-pricetag-background-hover);
    }
  }
`;

export default BlurredPhone;
