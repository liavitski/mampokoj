// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import AdStructuredData from '@/app/ad/[adId]/ad-structured-data';

/**
 * The JSON-LD block.
 *
 * Rendered to static markup and parsed back, rather than asserting on the
 * component's props: what matters is the bytes a crawler parses out of the
 * page, and a test that asserted on the input object could pass while the
 * serialisation was wrong.
 */
function rendered(ad: Partial<Parameters<typeof AdStructuredData>[0]['ad']>) {
  const html = renderToStaticMarkup(
    <AdStructuredData
      ad={{
        id: 'ad-1',
        title: 'Pokoj v Kladně',
        description: 'Velký pokoj v rodinném domě, wifi v ceně.',
        city: 'Kladno',
        price: '8000.00',
        availableFrom: new Date('2020-01-15T00:00:00Z'),
        images: [],
        ...ad,
      }}
    />
  );

  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );

  if (!match) throw new Error(`no ld+json block in: ${html}`);

  return JSON.parse(match[1]!) as Record<string, unknown>;
}

describe('ad structured data', () => {
  it('declares schema.org as its context', () => {
    expect(rendered({})['@context']).toBe('https://schema.org');
  });

  it('describes the ad as a Product with an absolute url', () => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';

    const data = rendered({});

    expect(data['@type']).toBe('Product');
    expect(data.url).toBe('https://mampokoj.vercel.app/ad/ad-1');
  });

  /**
   * The price is a **string**, not a JSON number.
   *
   * `price` is `numeric(10, 2)` and drizzle returns "8000.00" as a string. A
   * number here would have to be parsed from that string, and a crawler
   * recording a rounded or float-formatted price is a rich result that gets
   * discarded.
   */
  it('quotes the price as a string, exactly as the column returns it', () => {
    const offers = rendered({ price: '8000.00' }).offers as Record<
      string,
      unknown
    >;

    expect(offers.price).toBe('8000.00');
    expect(typeof offers.price).toBe('string');
  });

  it('declares the currency', () => {
    const offers = rendered({}).offers as Record<string, unknown>;

    expect(offers.priceCurrency).toBe('CZK');
  });

  it('reports a past availableFrom as InStock', () => {
    const offers = rendered({
      availableFrom: new Date('2020-01-15T00:00:00Z'),
    }).offers as Record<string, unknown>;

    expect(offers.availability).toBe('https://schema.org/InStock');
  });

  it('reports a future availableFrom as PreOrder', () => {
    const offers = rendered({
      availableFrom: new Date(Date.now() + 86_400_000),
    }).offers as Record<string, unknown>;

    expect(offers.availability).toBe('https://schema.org/PreOrder');
  });

  it('carries the photo when there is one', () => {
    expect(rendered({ images: [{ url: 'https://ufs.sh/p.jpg' }] }).image).toEqual(
      ['https://ufs.sh/p.jpg']
    );
  });

  it('omits image entirely when the ad has no photo', () => {
    expect(rendered({ images: [] })).not.toHaveProperty('image');
  });

  /**
   * The reason this file exists in this shape.
   *
   * The ad's phone number is withheld from anonymous HTML by design, and
   * `e2e/ad-detail.spec.ts` asserts it is absent from the response body.
   * JSON-LD is served to the same anonymous visitor, so a `tel:` URL or the
   * raw number in here would hand the one field the app goes to real trouble to
   * withhold to every crawler and every share-preview fetcher -- in a format
   * designed to be syndicated onward.
   */
  it('never contains a contact number or a tel: url', () => {
    /**
     * Rendered with the **full ad row**, not a hand-picked subset.
     *
     * `page.tsx` passes whatever `getValidatedAd` returned, and that query
     * selects the whole row -- `contactPhone` included. The component's prop
     * type does not mention the number, but a type is not a filter: this test
     * exists to prove the number is dropped when it *is* present in the input,
     * because the alternative (asserting on a row that never had it) would pass
     * no matter what the component did.
     */
    const fullRow = {
      id: 'ad-1',
      title: 'Pokoj v Kladně',
      description: 'Velký pokoj v rodinném domě.',
      city: 'Kladno',
      price: '8000.00',
      availableFrom: new Date('2020-01-15T00:00:00Z'),
      images: [],
      contactPhone: '+420123456789',
      userId: 'google-oauth-12345',
      reportedAt: null,
    } as unknown as Parameters<typeof AdStructuredData>[0]['ad'];

    const html = renderToStaticMarkup(<AdStructuredData ad={fullRow} />);
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    )!;

    expect(match[1]).not.toContain('+420123456789');
    expect(match[1]).not.toContain('tel:');
    // The poster's account id is moderation-adjacent for the same reason: it
    // is in the row and must not leave the server.
    expect(match[1]).not.toContain('google-oauth-12345');

    // And it still parses as the structured data a crawler expects.
    expect(JSON.parse(match[1]!)['@type']).toBe('Product');
  });

  /**
   * `description` is user-submitted text, so an ad whose body contains
   * `</script>` would otherwise close this tag and inject markup into the page.
   * The escape is `\u003c`, which is invisible to a JSON parser and cannot
   * terminate an HTML element.
   */
  it('escapes a script-closing sequence in user text', () => {
    const html = renderToStaticMarkup(
      <AdStructuredData
        ad={{
          id: 'ad-1',
          title: 'X',
          description: '</script><script>alert(1)</script>',
          city: 'Kladno',
          price: '1',
          availableFrom: new Date('2020-01-01T00:00:00Z'),
          images: [],
        }}
      />
    );

    // Exactly one script element: the injected one was neutralised.
    expect(html.match(/<script/g)!.length).toBe(1);
    expect(html).not.toContain('<script>alert(1)');
  });

  it('survives a parse after that escape', () => {
    // The other half of the injection test: escaping must not corrupt the JSON,
    // or a crawler would silently get no structured data at all.
    const html = renderToStaticMarkup(
      <AdStructuredData
        ad={{
          id: 'ad-1',
          title: 'X',
          description: '</script>',
          city: 'Kladno',
          price: '1',
          availableFrom: new Date('2020-01-01T00:00:00Z'),
          images: [],
        }}
      />
    );

    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );

    expect(() => JSON.parse(match![1]!)).not.toThrow();
  });
});