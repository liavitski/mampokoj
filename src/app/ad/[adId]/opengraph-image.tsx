import { ImageResponse } from 'next/og';

import { APP_TITLE, LIGHT_TOKENS } from '@/constants';
import { adCardData } from '@/lib/og-card';
import { loadOgPhoto } from '@/lib/og-photo';
import { getValidatedAd } from '@/server/queries/select';

/**
 * The share card for one ad.
 *
 * A link pasted into a chat is how a listing is actually shared, and it arrives
 * as a card: 1200×630, the room's own photo, and the three facts somebody
 * decides on before they open the link -- what it costs, which town, which kraj.
 *
 * What may be drawn is decided in `lib/og-card.ts`, which reads an allowlist
 * rather than the row. `getValidatedAd` selects the whole row, `contactPhone`
 * and `userId` included, and this is a public image at a guessable URL that
 * platforms keep for days. Nothing else about the ad is drawn here.
 *
 * **This file is what makes `/ad/[adId]` emit an `og:image` at all.** Measured
 * against 16.3.6: `generate-metadata.md:114` says file-based metadata overrides
 * `generateMetadata`, and for this route it does not. While the page declared
 * `openGraph.images`, the generated card was not emitted at all -- the metadata
 * image won silently. `page.tsx` therefore declares no images; see the comment
 * there before putting one back.
 *
 * Deliberately uncached. `HANDOFF.md` §2 records why for a marketplace where a
 * takedown must disappear at once, and a card is that same failure one step
 * removed: a cached one keeps a removed ad's title, price and photo readable
 * from a stable URL long after `deleteAdAsModerator` has taken the ad down. The
 * cost is one render per share, paid by the crawler rather than by a visitor.
 */

/**
 * A constant, because the export is a string and cannot know the ad -- so this
 * describes the picture rather than quoting the listing. The ad's own title and
 * description sit beside the image in `og:title` / `og:description` and are
 * per-ad; this is the fallback text for a platform that shows the image alone.
 */
export const alt = 'Inzerát pokoje k pronájmu: fotografie, cena a kraj';

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

type CardProps = {
  card: ReturnType<typeof adCardData>;
  /** A data URI, or `null` for the text-only layout. */
  photo: string | null;
};

/**
 * The card, in two layouts rather than one with an optional half.
 *
 * The text-only version is not a degraded version of the same design: it is the
 * layout for an ad whose photo does not exist or cannot be read, and a card
 * that shows a photo-shaped hole reads as a broken image. So the type gets the
 * full width and a larger size.
 */
function Card({ card, photo }: CardProps) {
  /**
   * City and region only. The price has a line of its own, and listing it in
   * both printed it twice on the card -- which is what the first render of this
   * did, caught by looking at the picture rather than by any test.
   */
  const facts = [card.city, card.region].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        background: LIGHT_TOKENS['--color-background'],
        color: LIGHT_TOKENS['--color-text'],
        fontFamily: 'sans-serif',
      }}
    >
      {photo ? (
        <img
          src={photo}
          // Never rendered: the output is a PNG, not markup, and satori ignores
          // the attribute. It is here because the photo *is* the listing, and an
          // `alt` on it costs nothing -- which is cheaper than a lint exception
          // explaining that.
          alt={card.title}
          width={600}
          height={630}
          // The photo is whatever aspect the poster uploaded -- `cover` is what
          // keeps a 4:3 phone snapshot and a 16:9 screenshot from letterboxing
          // differently in every card.
          style={{ objectFit: 'cover' }}
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: photo ? '72px 64px' : '96px 88px',
          width: photo ? 600 : 1200,
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: photo ? 52 : 68,
              fontWeight: 800,
              lineHeight: 1.15,
            }}
          >
            {card.title}
          </div>

          <div
            style={{
              marginTop: 28,
              fontSize: photo ? 38 : 44,
              // The price is the reason to keep reading, so it is the one line
              // that gets the accent colour rather than the muted one.
              color: LIGHT_TOKENS['--color-primary'],
              fontWeight: 600,
            }}
          >
            {card.price}
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: photo ? 32 : 38,
              color: LIGHT_TOKENS['--color-text-muted-foreground'],
            }}
          >
            {facts}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 28,
            color: LIGHT_TOKENS['--color-text-muted-foreground'],
          }}
        >
          {APP_TITLE}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders and reads the bytes back, rather than returning the `ImageResponse`.
 *
 * Materialising is what makes the fallback possible: satori reports an
 * undecodable image while the body is being written, so a response returned
 * directly cannot be caught -- measured, that path ended as a 500. Reading the
 * body here means a render that fails for any reason is a caught failure and a
 * card without a picture, rather than no card.
 */
async function render(element: React.ReactElement): Promise<Response> {
  const bytes = await new ImageResponse(element, { ...size }).arrayBuffer();

  return new Response(bytes, { headers: { 'content-type': contentType } });
}

export default async function Image({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const { adId } = await params;
  const ad = await getValidatedAd(adId);

  /**
   * A removed ad gets no card. The page 404s, the card 404s: a takedown that
   * leaves a public, cacheable image carrying the ad's title and price behind
   * would be a hole in `deleteAdAsModerator` that no test on the page could see.
   */
  if (!ad) {
    return new Response(null, { status: 404 });
  }

  const card = adCardData(ad);
  const photo = await loadOgPhoto(card.photoUrl);

  /**
   * Both elements are built before the `try`, not inside it. The lint rule that
   * forbids JSX in a `try` is aimed at React rendering, where an element
   * constructor throws nothing and the work happens later; here the element is
   * the argument and the failure is in the renderer, which `render` awaits. So
   * moving the construction out satisfies the rule without weakening the catch.
   */
  const withPhoto = photo ? <Card card={card} photo={photo} /> : null;
  const withoutPhoto = <Card card={card} photo={null} />;

  if (withPhoto) {
    try {
      return await render(withPhoto);
    } catch (error) {
      /**
       * `loadOgPhoto` proves the bytes are an image, but not that *this* build of
       * satori can decode that particular one -- an upload cut off mid-transfer
       * has a valid signature and a truncated body. Measured: that failure ends
       * as a 500 for the whole route. The card without a picture is worth far
       * more than the 500 it replaces, so it is drawn instead -- and the reason
       * is logged rather than swallowed, because a photo format that quietly
       * stopped rendering has nothing else to show for it.
       */
      console.error('opengraph-image: rendering with the photo failed', error);
    }
  }

  return render(withoutPhoto);
}