'use client';

import Link from 'next/link';
import styled, { css } from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';

/**
 * One box model for every control in the header.
 *
 * There used to be three, side by side: `Header`'s "My Ads" was a bare `<a>`
 * with `padding: 4px 12px` and no border; `AuthButton` went through `Button`,
 * whose base adds `border: 2px solid transparent` and so was 4px taller and 4px
 * wider than the link beside it; and the theme toggle was an `UnstyledButton`
 * with `border: none; padding: 0`, so its hover circle was the bare 24px icon.
 * Three shapes, three heights, three hover footprints in one row, and a `gap`
 * that measured the same distance between boxes of different sizes.
 *
 * Composed rather than configured: a caller picks `ControlLink` or
 * `ControlButton` and supplies the label and the icon, because the label is
 * visible text on wide screens and becomes the accessible name on narrow ones,
 * and that pairing has to be identical everywhere or it drifts again.
 */

const pill = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  min-height: var(--min-tap-target-height);
  padding: 4px 14px;

  /* Transparent rather than absent, so that a focus ring drawn on the border
     has somewhere to sit and every control is the same height. */
  border: 2px solid transparent;
  border-radius: 16px;

  font: inherit;
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background-color: var(--color-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  /* The label goes first, because the icon carries the same meaning and takes
     a third of the width. The border stays, though: dropping it here is what
     made the controls sit at different heights before. */
  @media ${QUERIES.phoneAndSmaller} {
    gap: 0;
    padding: 4px 10px;
  }
`;

export const ControlLink = styled(Link)`
  ${pill}
  color: var(--color-text);
`;

export const ControlButton = styled.button`
  ${pill}
  color: var(--color-text);
  background-color: transparent;
`;

/**
 * Removed from view without leaving the accessibility tree. The icons are all
 * `aria-hidden`, so `display: none` here would leave the control with no
 * accessible name at all.
 */
const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
`;

/**
 * The control's name, visible on wide screens and hidden on a phone. Pairs
 * with `ControlIcon`.
 */
export const ControlLabel = styled.span`
  @media ${QUERIES.phoneAndSmaller} {
    ${visuallyHidden}
  }
`;

/**
 * A name that is never visible. For a control whose label is a sentence rather
 * than a word -- the theme toggle's "Toggle dark / light mode" -- where showing
 * it would make the header wider than the page is worth. Pairs with
 * `ControlIconAlways`.
 */
export const ControlNameOnly = styled.span`
  ${visuallyHidden}
`;

/** Shown only once `ControlLabel` has been visually removed. */
export const ControlIcon = styled.span`
  display: none;

  @media ${QUERIES.phoneAndSmaller} {
    display: inline-flex;
  }
`;

/** Shown at every width, for a control that has no visible label at all. */
export const ControlIconAlways = styled.span`
  display: inline-flex;
`;