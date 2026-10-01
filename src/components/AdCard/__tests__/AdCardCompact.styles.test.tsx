/**
 * `AdCardCompact` is rendered in two places, and the box around it differs: as
 * the whole of /ad/[adId] it *is* the card and needs its own surface, and inside
 * the modal it must not have one, or the dialog draws a card within a card.
 *
 * These assert the modal branch specifically, because it is the one that
 * regresses invisibly -- the stylesheet is still valid and the card is still
 * legible, just framed twice.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { Wrapper } from '../AdCardCompact.styles';

/** Every injected CSS rule whose selector mentions the element's classes. */
function rulesSelecting(element: Element): string[] {
  const classes = Array.from(element.classList);

  return Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return [];
      }
    })
    .filter((rule) => classes.some((c) => rule.cssText.includes(`.${c}`)))
    .map((rule) => rule.cssText);
}

/**
 * The card as the browser resolves it.
 *
 * `getComputedStyle` rather than matching the stylesheet text, because the CSSOM
 * does not round-trip these declarations: styled-components' `border: none`
 * serialises as `border: medium`, which is a *width* and reads as a border being
 * present. Computed style is what a user actually gets.
 */
function renderInsideModalBox(): CSSStyleDeclaration {
  const { container } = render(
    <div data-modal-box="">
      <Wrapper>
        <p>Ad content</p>
      </Wrapper>
    </div>
  );

  return getComputedStyle(container.querySelector('article')!);
}

function renderInsideModalBoxRules(): string {
  const { container } = render(
    <div data-modal-box="">
      <Wrapper>
        <p>Ad content</p>
      </Wrapper>
    </div>
  );

  return rulesSelecting(container.querySelector('article')!).join('\n');
}

function renderStandalone(): string {
  const { container } = render(
    <Wrapper>
      <p>Ad content</p>
    </Wrapper>
  );

  return rulesSelecting(container.querySelector('article')!).join('\n');
}

describe('AdCardCompact Wrapper', () => {
  it('keeps its own surface when it is the whole page', () => {
    // /ad/[adId] renders this with nothing around it. If the card loses its
    // background here it becomes text on the page background.
    const rules = renderStandalone();

    expect(rules, 'the standalone card has no background').toMatch(
      /background-color\s*:\s*var\(--color-card-background\)/
    );
    expect(rules, 'the standalone card has no border').toMatch(/border\s*:/);
    expect(rules, 'the standalone card has no padding').toMatch(/padding\s*:/);
  });

  it('drops its own surface inside the modal box', () => {
    const style = renderInsideModalBox();

    // The dialog's Content supplies all four. Checked on the selector too, so
    // this cannot pass on the unconditional card rules that are still in the same
    // stylesheet.
    expect(
      renderInsideModalBoxRules(),
      'no rule scoped to the modal box, so the card keeps a surface inside the dialog'
    ).toMatch(/\[data-modal-box\]/);

    // Read from getComputedStyle rather than matched against the source text,
    // because the CSSOM does not round-trip these declarations: styled-components'
    // `border: none` serialises as `border: medium`, which is a *width* and reads
    // as a border being present. Computed style is what a user actually gets.
    expect(style.borderStyle, 'the card keeps a border inside the dialog').toBe('none');
    expect(style.borderWidth, 'the card keeps a border width').toBe('0px');
    expect(style.padding, 'the card still adds padding inside the dialog').toBe('0px');
    // jsdom reports a fully transparent colour as rgba(0, 0, 0, 0) rather than
    // the `transparent` keyword.
    expect(style.backgroundColor, 'the card still paints over the dialog box').toBe(
      'rgba(0, 0, 0, 0)'
    );
  });

  it('fills the modal box rather than tracking its content height', () => {
    const style = renderInsideModalBox();

    // `height: max-content` is what let the dialog's visible size follow the
    // photo count and the description length.
    expect(
      style.height,
      'the card still sizes itself to its content, so the dialog resizes with it'
    ).not.toBe('max-content');
    expect(style.minHeight, 'the card does not fill the modal box').toBe('100%');
  });
});
