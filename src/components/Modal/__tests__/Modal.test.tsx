/**
 * The modal's *box* is what makes it read as a dialog.
 *
 * `Content` used to be `position: fixed; inset: 0` with `align-self`/`justify-self:
 * center`. Neither alignment property does anything on a non-flex, non-grid
 * parent, and `Dialog.Portal` renders into `document.body`, so the element was a
 * full-viewport transparent box: its `border-radius` and `max-height` applied to
 * nothing visible, and `AdCardCompact` floated in the middle of the screen with
 * no frame around it. The dialog's size was therefore whatever the card's
 * content happened to be, so it changed with photo count and description length.
 *
 * jsdom computes no layout, so none of this can be asserted by measuring. These
 * assert the *stylesheet* instead -- the same approach `Header.test.tsx` uses
 * for rules jsdom will not evaluate -- and each one names the declaration whose
 * absence is the bug.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import Modal from '../Modal';

/** Every injected CSS rule whose selector mentions the element's classes. */
function rulesSelecting(element: Element | null): string[] {
  if (!element) return [];

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

/** Rules that apply at every width, i.e. not nested inside a media query. */
function unconditionalRules(element: Element | null): string[] {
  return rulesSelecting(element).filter((rule) => !rule.startsWith('@media'));
}

function renderModal() {
  render(
    <Modal defaultOpen>
      <p>Ad content</p>
    </Modal>
  );

  // Radix portals into document.body, so the dialog is not under `container`.
  return screen.getByRole('dialog');
}

describe('Modal box', () => {
  it('gives the dialog a height of its own rather than filling the viewport', () => {
    const dialog = renderModal();

    const rules = unconditionalRules(dialog);
    expect(rules.length, 'no unconditional rule found for the dialog').toBeGreaterThan(
      0
    );

    // `inset: 0` is the bug: it makes the element the size of the screen, so the
    // visible size is decided by the content inside it.
    for (const rule of rules) {
      expect(rule, `the dialog still stretches to the viewport: ${rule}`).not.toMatch(
        /inset\s*:\s*0/
      );
    }

    // A `height`, not a `max-height`. `max-height: 95dvh` was present in the
    // broken version too, and asserts nothing about a short ad, which is the
    // case that regressed -- so this has to be the exact property, not a
    // substring that `max-height` would satisfy.
    const heights = rules.filter((rule) => /(?<![-\w])height\s*:/.test(rule));
    expect(
      heights.length,
      'the dialog has no height of its own, so its size comes from its content'
    ).toBeGreaterThan(0);
    for (const rule of heights) {
      expect(rule, 'the height is only a ceiling, so the box still tracks content')
        .toMatch(/(?<![-\w])height\s*:\s*(?!max)/);
    }

    // And it has to be bounded, or a long description stretches the dialog again.
    expect(
      rules.join('\n'),
      'the dialog height is unbounded, so a long ad stretches it'
    ).toMatch(/(?<![-\w])height\s*:\s*min\(/);
  });

  it('centres the box itself, not its content', () => {
    const dialog = renderModal();

    const rules = unconditionalRules(dialog).join('\n');

    // Offset-and-translate, because this element's parent is `body` (Dialog.Portal
    // renders it there) and `align-self`/`justify-self` position a flex or grid
    // *item*, so they do nothing here.
    expect(rules, 'the dialog is not offset from the viewport top').toMatch(
      /top\s*:\s*50%/
    );
    expect(rules, 'the dialog is not offset from the viewport left').toMatch(
      /left\s*:\s*50%/
    );
    expect(rules, 'the dialog is not pulled back onto the centre').toMatch(
      /transform\s*:\s*translate\(-50%,\s*-50%\)/
    );
  });

  it('stretches its content across the box rather than shrink-wrapping it', () => {
    // The regression this catches: `align-items: center` on a
    // `flex-direction: column` container applies to the *cross* axis, which is
    // horizontal, so the scroll area shrink-wrapped to its text instead of
    // filling the 800px box. Measured in the browser: an 800px box whose content
    // was 259px wide, with the photo and info halves at 122px each.
    const dialog = renderModal();
    const rules = unconditionalRules(dialog).join('\n');

    expect(rules, 'the dialog is not a column flex container').toMatch(
      /flex-direction\s*:\s*column/
    );

    // `stretch` is the initial value, so the correct fix is simply to not set
    // `align-items` to anything that shrink-wraps.
    const alignItems = /align-items\s*:\s*([^;]+)/.exec(rules)?.[1]?.trim();

    expect(
      alignItems,
      'the dialog centres its content horizontally, so the scroll area shrink-wraps instead of filling the box'
    ).not.toBe('center');
    expect(
      ['flex-start', 'start', 'stretch', 'flex-end', 'end', 'baseline'],
      `unexpected align-items on the dialog: ${alignItems}`
    ).toContain(alignItems ?? 'stretch');
  });

  it('paints the box, so it reads as a dialog rather than floating text', () => {
    const dialog = renderModal();

    const rules = unconditionalRules(dialog).join('\n');

    // Without a surface of its own the card sat on the overlay with no frame,
    // which is what made it read as unstyled.
    expect(rules, 'the dialog has no background of its own').toMatch(
      /background-color\s*:/
    );
    expect(rules, 'the dialog has no border-radius of its own').toMatch(
      /border-radius\s*:/
    );
  });

  it('scrolls inside the box instead of growing it', () => {
    renderModal();

    const scroller = document.querySelector('[data-modal-scroll]');

    expect(scroller, 'the modal has no element marked as its scroll area').not.toBeNull();

    const rules = unconditionalRules(scroller).join('\n');

    // `flex: 1` plus `min-height: 0` is what lets the child shrink and the
    // overflow scroll; without `min-height: 0` a flex item refuses to shrink
    // below its content and the box grows instead.
    expect(rules, 'the scroll area cannot shrink, so the box grows with content').toMatch(
      /min-height\s*:\s*0/
    );
    expect(rules, 'the scroll area does not scroll').toMatch(/overflow-y\s*:\s*auto/);
  });

  it('keeps the close button inside the box', () => {
    renderModal();

    const close = screen.getByRole('button', { name: /close modal/i });
    const dialog = screen.getByRole('dialog');

    expect(dialog.contains(close)).toBe(true);
  });
});
