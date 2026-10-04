// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadOgPhoto, sniffImageType } from '../og-photo';

/** A real 1×1 PNG, so the success path is a decode and not a stub. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const PHOTO_URL = 'https://ufs.sh/photo.jpg';

const fetchStub = vi.fn();

/** A `fetch` that answers with the given status, content type and bytes. */
function respondingWith(status: number, contentType: string, body: Buffer) {
  fetchStub.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => body,
  });
}

/**
 * Fetching one photo for a share card.
 *
 * Every failure case below measured as a **500** on the whole route before this
 * module existed: handing satori a URL it cannot read gives an unknown image
 * type, then `Image size cannot be determined`, and the image the crawler asked
 * for does not exist. A photo row pointing at a deleted file is an expected
 * state here (HANDOFF §2.2 -- dangling rows are reported and never deleted), so
 * "could not load it" has to be an ordinary answer.
 */
describe('loadOgPhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchStub.mockReset();
  });

  it('does not fetch anything when the ad has no photo', async () => {
    vi.stubGlobal('fetch', fetchStub);

    // The common case for a fresh ad, and the one where a stray request would be
    // a wasted round trip to somebody else's server.
    expect(await loadOgPhoto(null)).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns the photo as a data URI when it loads', async () => {
    vi.stubGlobal('fetch', fetchStub);
    respondingWith(200, 'image/png', ONE_PIXEL_PNG);

    const src = await loadOgPhoto(PHOTO_URL);

    expect(src).toBe(`data:image/png;base64,${ONE_PIXEL_PNG.toString('base64')}`);
  });

  it('asks for exactly the ad photo, with an abort signal', async () => {
    vi.stubGlobal('fetch', fetchStub);
    respondingWith(200, 'image/png', ONE_PIXEL_PNG);

    await loadOgPhoto(PHOTO_URL);

    // The signal is not decoration: this runs inside a request a crawler has
    // already made, and without a bound a slow storage host holds the card open
    // for as long as it likes. The timeout itself is not asserted -- Node's
    // `AbortSignal.timeout` is native and does not fire under fake timers -- so
    // what is checked is that a signal exists to be fired.
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, options] = fetchStub.mock.calls[0];
    expect(url).toBe(PHOTO_URL);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up on a photo that is not there', async () => {
    vi.stubGlobal('fetch', fetchStub);
    respondingWith(404, 'text/html', Buffer.from('<h1>Not found</h1>'));

    expect(await loadOgPhoto(PHOTO_URL)).toBeNull();
  });

  it('gives up on a response that is not an image', async () => {
    // A storage host answering 200 with an HTML error page, or a redirect to a
    // sign-in form. Reading that as bytes would reach satori as an unknown type.
    vi.stubGlobal('fetch', fetchStub);
    respondingWith(200, 'text/html', Buffer.from('<html></html>'));

    expect(await loadOgPhoto(PHOTO_URL)).toBeNull();
  });

  it('gives up when the host is unreachable', async () => {
    vi.stubGlobal('fetch', fetchStub);
    fetchStub.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    // Swallowed deliberately: the caller has a whole card to draw without a
    // picture, and one dead host must not cost every other ad its card.
    expect(await loadOgPhoto(PHOTO_URL)).toBeNull();
  });

  it('gives up on bytes that are not an image, whatever the header claims', async () => {
    vi.stubGlobal('fetch', fetchStub);
    respondingWith(200, 'image/png', Buffer.from('this is not a png'));

    // A host that serves an error body as `image/png`. Sniffing is what catches
    // it: the header is the one thing known to be wrong here.
    expect(await loadOgPhoto(PHOTO_URL)).toBeNull();
  });

  it('refuses an oversized photo from its declared size, without reading it', async () => {
    vi.stubGlobal('fetch', fetchStub);
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'image/jpeg',
        'content-length': String(9 * 1024 * 1024),
      }),
      arrayBuffer: async () => {
        throw new Error('the body must never be read');
      },
    });

    // 9 MB of base64 in a 1200×630 card costs time for detail the card cannot
    // show, and 8 MB is the ceiling Facebook publishes for an `og:image`, so
    // above it the platform that matters most rejects the image anyway. Refusing
    // on the header is what makes the cost zero rather than 9 MB.
    expect(await loadOgPhoto(PHOTO_URL)).toBeNull();
  });

  it('refuses an oversized photo whose header understates it', async () => {
    vi.stubGlobal('fetch', fetchStub);
    respondingWith(200, 'image/jpeg', Buffer.alloc(9 * 1024 * 1024));

    // `Content-Length` is the host's claim, not a fact: a chunked response has
    // none. Without the second check on the bytes that arrive, that goes
    // straight into base64.
    expect(await loadOgPhoto(PHOTO_URL)).toBeNull();
  });

  it('never lets an exception out, whatever the host does', async () => {
    vi.stubGlobal('fetch', fetchStub);
    fetchStub.mockRejectedValue(new TypeError('fetch failed'));

    await expect(loadOgPhoto(PHOTO_URL)).resolves.toBeNull();
  });

  it('names the type from the bytes, not from the header', async () => {
    vi.stubGlobal('fetch', fetchStub);
    // A JPEG served as `image/png`. satori picks its decoder from the mime in
    // the data URI, so taking the header's word for it decodes a JPEG as a PNG.
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(32),
    ]);
    respondingWith(200, 'image/png', jpeg);

    const src = await loadOgPhoto(PHOTO_URL);

    expect(src).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
  });
});

/**
 * Recognising an image from its first bytes.
 *
 * The formats are the ones the renderer itself dispatches on, and the assertion
 * that matters is the negative one: anything unrecognised has to come back
 * `null`, because a mime the renderer does not know is not an error there -- it
 * draws a filled block, which is exactly the photo-shaped hole the sniffing
 * exists to prevent.
 */
describe('sniffImageType', () => {
  it('recognises the formats a listing photo arrives in', () => {
    expect(sniffImageType(ONE_PIXEL_PNG)).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg'
    );
    expect(sniffImageType(Buffer.from('GIF89a....'))).toBe('image/gif');
    expect(
      sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))
    ).toBe('image/webp');
    expect(
      sniffImageType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif')]))
    ).toBe('image/avif');
    expect(sniffImageType(Buffer.from('<svg xmlns="..."></svg>'))).toBe(
      'image/svg+xml'
    );
  });

  it('returns null for bytes that are not an image', () => {
    expect(sniffImageType(Buffer.from('<html><body>404</body></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('{"error":"not found"}'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('does not mistake a RIFF container that is not a webp for one', () => {
    // `RIFF` opens WAV and AVI too, and the tag is what says which.
    expect(
      sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))
    ).toBeNull();
  });
});