// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { adCardData } from '../og-card';

/**
 * The generated Open Graph card for one ad.
 *
 * This module is the allowlist: the route composes pixels from what it returns,
 * and nothing else about the row reaches the card. The phone-leak case below is
 * the reason it is a separate pure module -- `getValidatedAd` selects the whole
 * row, `contactPhone` and `userId` included, so "the card does not show the
 * number" is otherwise a claim about an image nobody can read.
 */
const ad = {
  title: 'Pokoj v Kladně',
  city: 'Kladno',
  price: '8000',
  region: 'ST',
  contactPhone: '+420123456789',
  userId: 'seeded-poster-1',
  slot: 0,
  reportedAt: new Date('2026-02-02'),
  images: [{ url: 'https://ufs.sh/photo.jpg' }],
};

describe('adCardData', () => {
  it('carries the title and city as written', () => {
    const card = adCardData(ad);

    expect(card.title).toBe('Pokoj v Kladně');
    expect(card.city).toBe('Kladno');
  });

  it('formats the price as Czech crowns, not as a raw number', () => {
    // `8 000` rather than `8000`: a share card is read by somebody deciding
    // whether to click, and an unformatted price reads as a serial number.
    const card = adCardData(ad);

    expect(card.price).toBe(
      new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: 'CZK',
        maximumFractionDigits: 0,
      }).format(8000)
    );
    expect(card.price).toContain('Kč');
  });

  it('names the region in Czech, not by its code', () => {
    // `ST` on a card is a code; "Středočeský kraj" is a place. The region
    // picker and every metadata string already speak Czech here.
    expect(adCardData(ad).region).toBe('Středočeský kraj');
  });

  it('leaves the region null for a code it does not know', () => {
    // Not `undefined` and not the raw code: the route has to be able to decide
    // whether to draw the line at all, and `undefined` would read as "present
    // but empty" in a truthiness check somewhere later.
    expect(adCardData({ ...ad, region: 'ZZ' }).region).toBeNull();
  });

  it('takes the first photo when the ad has one', () => {
    expect(adCardData(ad).photoUrl).toBe('https://ufs.sh/photo.jpg');
  });

  it('has no photo to draw when the ad has none', () => {
    expect(adCardData({ ...ad, images: [] }).photoUrl).toBeNull();
  });

  it('never carries the contact number or the poster id', () => {
    const card = adCardData(ad);

    expect(Object.keys(card).sort()).toEqual([
      'city',
      'photoUrl',
      'price',
      'region',
      'title',
    ]);
    expect(JSON.stringify(card)).not.toContain('+420123456789');
    expect(JSON.stringify(card)).not.toContain('seeded-poster-1');
  });

  it('never carries moderation state either', () => {
    // `reportedAt` is withheld from every public payload
    // (`detailAdColumns`), so a card carrying it would be a second surface for
    // the same leak -- and one that outlives the page by however long a crawler
    // keeps the image.
    expect(JSON.stringify(adCardData(ad))).not.toContain('reportedAt');
  });
});