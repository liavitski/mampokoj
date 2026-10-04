/**
 * The card's cover image carries `alt=""`, and these pin down why that is the
 * accessible outcome rather than a missing label.
 *
 * The defect was `alt={title}` on an image whose `src` falls back to the
 * decorative `/globe.svg`, sitting inside the card's `<Link>` -- so the alt fed
 * the link's accessible name and the title was announced twice per card.
 *
 * Counted through `cardLinkName`, not by reading the `alt` attribute: what a
 * screen-reader user hears is the *concatenation*, and an assertion about the
 * attribute alone would still pass while the concatenation stayed wrong.
 * `toHaveAccessibleName` is asserted alongside it as the real computation.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import AdSummaryCard from '../AdSummaryCard';
import type { PublicAd } from '@/types/db-types';

const TITLE = 'Bright room in Žižkov';

function makeAd(overrides: Partial<PublicAd> = {}): PublicAd {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: TITLE,
    price: '8500.00',
    city: 'Prague',
    region: 'PR',
    availableFrom: new Date('2026-01-15T00:00:00.000Z'),
    description: 'A bright room facing the courtyard.',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    images: [
      {
        id: '00000000-0000-4000-8000-0000000000ff',
        url: 'https://example.com/photo.jpg',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

/** How many times `needle` occurs in `haystack`, without regex escaping. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * The link's name as a browser computes it from contents: every descendant's
 * text, with each image contributing its `alt` *in place of* nothing.
 *
 * The substitution is the whole point. `textContent` alone cannot see this
 * defect at all -- an `alt` is not text content, so the duplicated title is
 * invisible to it -- which is why the old markup could render a card whose
 * title was announced twice while every text-based assertion stayed green.
 */
function cardLinkName(link: HTMLElement): string {
  const clone = link.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('img').forEach((img) => {
    img.replaceWith(document.createTextNode(img.getAttribute('alt') ?? ''));
  });

  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Render the card and hand back its link. */
function renderCard(overrides: Partial<PublicAd> = {}): HTMLElement {
  render(<AdSummaryCard ad={makeAd(overrides)} />);

  return screen.getByRole('link');
}

describe('AdSummaryCard cover image', () => {
  it('names the card link with the title exactly once', () => {
    // The headline regression: `alt={title}` inside the <Link> made the name
    // read "<title> <title> A bright room...".
    const link = renderCard();

    expect(link).toHaveAccessibleName(expect.stringContaining(TITLE));
    expect(
      occurrences(cardLinkName(link), TITLE),
      'the title is announced twice'
    ).toBe(1);
  });

  it('exposes no image in the card to the accessibility tree', () => {
    // The second guard on the same fix. "The title is not repeated" is also
    // satisfied by moving the duplicate somewhere else; this says the cover is
    // presentational outright, which is what keeps the placeholder globe from
    // being announced as the listing's subject matter.
    const link = renderCard();

    // `img` with `alt=""` maps to role `presentation`, so it matches no image
    // role at all -- the assertion is on the role, not on the attribute.
    expect(screen.queryAllByRole('img'), 'the cover is presentational').toEqual(
      []
    );
    expect(link.querySelectorAll('img').length, 'the cover still renders').toBe(1);
  });

  it('still renders the title as visible text', () => {
    // `alt=""` is only the right call because the title is right there. Dropping
    // the alt and the visible title together would leave the card's link named
    // only by its description, and neither assertion above would catch it.
    render(<AdSummaryCard ad={makeAd()} />);

    expect(
      screen.getByRole('heading', { name: TITLE }),
      'the title is still on the card'
    ).toBeInTheDocument();
  });

  it('names the link once more when the ad has no photos', () => {
    // The fallback branch. `image` becomes `/globe.svg`, and an alt naming the
    // ad here would announce a stock globe as if it were the listing's subject.
    const link = renderCard({ images: [] });
    const name = cardLinkName(link);

    expect(occurrences(name, TITLE)).toBe(1);
    expect(name.toLowerCase(), 'the placeholder is not announced').not.toContain(
      'globe'
    );
  });

  it('names the link from text rather than from the image', () => {
    // Guards the `alt=""` choice from the other direction. An empty alt and a
    // missing alt are indistinguishable in the accessibility tree, so this pins
    // that the name survives with the image contributing nothing.
    const link = renderCard();

    expect(cardLinkName(link)).toContain('Prague');
    expect(cardLinkName(link)).not.toBe('');
  });
});