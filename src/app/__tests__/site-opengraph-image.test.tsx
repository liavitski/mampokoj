// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * The queries this card must never touch.
 *
 * Mocked to *throw* rather than to return an empty list, so the test below
 * proves the site card reads nothing: a card that quietly joined the ads table
 * would render fine here and turn a static image into a per-request render.
 */
vi.mock('@/server/queries/select', () => ({
  getValidatedAd: () => {
    throw new Error('the site card must not read an ad');
  },
  getIndexableAds: () => {
    throw new Error('the site card must not read the ads table');
  },
  getAds: () => {
    throw new Error('the site card must not read the ads table');
  },
}));

const { default: siteCard, alt, size, contentType } = await import(
  '../opengraph-image'
);

/** The width and height the PNG itself declares, from its IHDR chunk. */
function renderedSize(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

/**
 * The site card: the picture a shared `/` link gets.
 *
 * Rendered for real, and its dimensions read out of the PNG header rather than
 * taken from the `size` export -- the export is what `og:image:width` claims, so
 * a render at a different size would make that claim false and no other test
 * here would notice.
 */
describe('the site share card', () => {
  it('declares the size and type its meta tags will advertise', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
    expect(alt.length).toBeGreaterThan(0);
  });

  it('renders a 1200×630 PNG', async () => {
    const response = await siteCard();
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(renderedSize(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it('draws the site name, so the card is not a blank rectangle', async () => {
    // A card that rendered an empty page would be a valid PNG of the right size,
    // and the one thing it must never be is a picture of nothing. Text cannot be
    // read out of a PNG, so this is a floor rather than a proof: it fails if the
    // card ever stops rendering ink at all.
    const response = await siteCard();
    const bytes = Buffer.from(await response.arrayBuffer());

    // A flat background compresses to a few KB. Anything with letters on it does
    // not, and the margin here is three orders of magnitude wide.
    expect(bytes.byteLength).toBeGreaterThan(5_000);
  });

  it('takes no arguments, because there is nothing per-request about it', () => {
    // `/` serves fourteen region pages through one `?region=` parameter, and an
    // image route is given `params` only -- never `searchParams`. Declared arity
    // is the assertion that can notice: a per-region card would have to
    // destructure `searchParams` here, which this file cannot do, so the
    // argument count is the shape of that guarantee. The consequence is recorded
    // rather than papered over -- one picture for all fourteen region pages, with
    // the region's name in `og:title` where it already was.
    expect(siteCard.length).toBe(0);
  });
});
