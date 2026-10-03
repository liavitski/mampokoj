import 'server-only';

import { absoluteUrl, adAvailability, adMetaDescription } from '@/lib/seo';
import { APP_TITLE } from '@/constants';

/**
 * `schema.org` JSON-LD for one listing.
 *
 * Rendered into the page rather than into the `<head>` because structured data
 * belongs with the content it describes, and a crawler reading the body already
 * has the visible title and price to check it against -- a feed of numbers
 * nothing on the page corroborates is exactly the kind of markup a reviewer
 * discards.
 *
 * **Deliberately omitted: `contactPhone` and any `tel:` URL.** The ad's phone
 * number is visible on this page only to a signed-in visitor, and it is
 * withheld from anonymous HTML entirely (asserted in `e2e/ad-detail.spec.ts`).
 * Publishing it in JSON-LD would hand every crawler the one field the app goes
 * to real trouble to withhold, and it would do so in a format intended to be
 * syndicated. The listing is findable and describable without it.
 *
 * `Product` + `Offer` rather than `Accommodation`: the latter's rich-result
 * support is scoped to hotel and vacation-rental properties, and a private
 * room let by its owner is neither. `Offer.price` is the string form of the
 * numeric column, and `priceCurrency` is what makes it unambiguous.
 */
type StructuredDataAd = {
  id: string;
  title: string;
  description: string;
  city: string;
  price: string | number;
  availableFrom: Date | string;
  images: { url: string }[];
};

export default function AdStructuredData({ ad }: { ad: StructuredDataAd }) {
  const url = absoluteUrl(`/ad/${ad.id}`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: ad.title,
    description: adMetaDescription(ad),
    url,
    ...(ad.images[0] ? { image: [ad.images[0].url] } : {}),
    category: 'Pronájem pokoje',
    offers: {
      '@type': 'Offer',
      url,
      // String, not number: JSON numbers cannot hold every decimal, and a
      // price that arrives rounded is a price a crawler records as wrong.
      price: String(ad.price),
      priceCurrency: 'CZK',
      availability: adAvailability(ad.availableFrom),
      seller: {
        '@type': 'Organization',
        name: APP_TITLE,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      /**
       * `JSON.stringify` output embedded in a `<script>` block. The `</script>`
       * escape is load-bearing: `description` is user-submitted text, so an ad
       * whose body contains that sequence would otherwise close this tag and
       * inject markup into the page. Escaping the slash as `<\/` is invisible
       * to JSON parsers and cannot terminate the element.
       */
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
      }}
    />
  );
}