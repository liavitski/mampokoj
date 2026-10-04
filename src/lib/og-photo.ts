/**
 * Reads one photo for a share card, or reports that it could not.
 *
 * The generated Open Graph card draws the ad's photo, and satori cannot be
 * handed a URL: measured against Next.js 16.3.6, an image it could not load
 * produced `Unsupported image type`, then `Image size cannot be determined`, and
 * the whole image route answered **500**. So the bytes are fetched here, checked,
 * and passed on as a data URI -- or not passed on at all.
 *
 * "Could not load it" is an ordinary outcome, not an exception. A photo row
 * pointing at a deleted file is an expected state here: reconciliation reports
 * dangling rows and deliberately never deletes them, because a removed ad's rows
 * are indistinguishable from damage (HANDOFF §2.2), and `teardownAd` removes
 * files. One such ad must not cost every other ad its card.
 */

/**
 * How long a card will wait for a photo before drawing without one.
 *
 * Short on purpose. This runs inside a request a crawler has already made, and
 * the honest answer to a slow storage host is a card with no picture rather than
 * an open connection -- the picture is an enhancement, not the content.
 */
const PHOTO_TIMEOUT_MS = 3_000;

/**
 * Above this the photo is not read. 8 MB is the ceiling Facebook publishes for
 * an `og:image`, so above it the platform that matters most rejects the image
 * anyway, and base64-ing it into a 1200×630 render costs time for detail the
 * card cannot show.
 */
const PHOTO_BYTE_LIMIT = 8 * 1024 * 1024;

/** The bytes every one of these formats starts with. */
const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
  /** `RIFF`, then four length bytes, then `WEBP` -- so the tag is at offset 8. */
  webpHead: [0x52, 0x49, 0x46, 0x46],
  webpTag: [0x57, 0x45, 0x42, 0x50],
  /** ISO base media: `....ftypavif` -- the brand is at offset 8. */
  ftyp: [0x66, 0x74, 0x79, 0x70],
  avifBrand: [0x61, 0x76, 0x69, 0x66],
};

function startsWith(bytes: Uint8Array, magic: number[], offset = 0) {
  return magic.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * The image format the bytes actually are, or `null`.
 *
 * Taken from the bytes rather than the `Content-Type` header, for two measured
 * reasons. A header is the host's claim, and hosts mislabel: satori picks its
 * decoder from the mime it is given, so a JPEG labelled `image/png` is decoded
 * as a PNG. And a mime satori does not know is not an error either -- measured,
 * it draws a filled block where the photo should be, which is the photo-shaped
 * hole a share card must not have. Sniffing rejects that before the renderer
 * sees it, and gives the data URI a mime that matches its contents.
 *
 * The list is what @vercel/og's own renderer dispatches on (measured in
 * `next/dist/compiled/@vercel/og/index.node.js`: png, apng, jpeg, gif, webp,
 * avif, svg). APNG is absent because it shares PNG's signature and the same
 * decoder. A format missing from this list loses its photo and gets the
 * text-only card, which is a far better outcome than a grey rectangle.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, MAGIC.png)) return 'image/png';
  if (startsWith(bytes, MAGIC.jpeg)) return 'image/jpeg';
  if (startsWith(bytes, MAGIC.gif)) return 'image/gif';

  if (
    startsWith(bytes, MAGIC.webpHead) &&
    startsWith(bytes, MAGIC.webpTag, 8)
  ) {
    return 'image/webp';
  }

  if (startsWith(bytes, MAGIC.ftyp, 4) && startsWith(bytes, MAGIC.avifBrand, 8)) {
    return 'image/avif';
  }

  // SVG is text, so it has no binary signature -- it is the one format that has
  // to be recognised by looking at it.
  const head = Buffer.from(bytes.subarray(0, 256)).toString('utf8');

  if (head.includes('<svg')) return 'image/svg+xml';

  return null;
}

/**
 * A data URI the renderer can decode, or `null`.
 *
 * `null` covers every way this can fail to produce a usable picture: no photo on
 * the ad, a host that 404s, a response that is not an image, bytes that are not
 * one, a photo too large to be worth embedding, and a host that cannot be
 * reached at all.
 */
export async function loadOgPhoto(url: string | null): Promise<string | null> {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    /**
     * Cheap exit, not the decision. It keeps an HTML error page from being
     * downloaded in full, and the bytes are checked properly below -- a host
     * serving a real image as `application/octet-stream` loses its photo here,
     * which is the cost of not reading megabytes of a 404 page.
     */
    if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
      return null;
    }

    /**
     * Declared size first, so an oversized photo is refused before it is
     * downloaded rather than after. Not trusted on its own -- a host may omit
     * `Content-Length` or understate it -- which is why the same limit is
     * checked again on the bytes that arrive.
     */
    const declared = Number(response.headers.get('content-length'));

    if (Number.isFinite(declared) && declared > PHOTO_BYTE_LIMIT) return null;

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > PHOTO_BYTE_LIMIT) return null;

    const type = sniffImageType(bytes);

    if (!type) return null;

    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    // Unreachable host, DNS failure, timeout, a truncated body, an aborted
    // request. All of them mean the same thing to the card.
    return null;
  }
}