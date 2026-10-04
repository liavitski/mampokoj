// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getValidatedAd = vi.fn();

vi.mock('@/server/queries/select', () => ({
  getValidatedAd: (...args: unknown[]) => getValidatedAd(...args),
}));

/**
 * A renderer that fails on demand, for the one case nothing can provoke.
 *
 * The fallback in the route exists because a render *can* fail on a photo it
 * cannot read -- measured, that path ended as a 500 -- but no input reaches it
 * reliably: satori silently ignores some unreadable bytes and throws on others,
 * and which is which is its business rather than this test's. So the failure is
 * injected at the boundary, where it costs one line, and the real renderer
 * answers every other case in this file.
 */
const renderer = { failNextRender: false };

vi.mock('next/og', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/og')>();

  return {
    ...actual,
    ImageResponse: class extends actual.ImageResponse {
      constructor(
        element: React.ReactElement,
        options?: ConstructorParameters<typeof actual.ImageResponse>[1]
      ) {
        if (renderer.failNextRender) {
          renderer.failNextRender = false;
          throw new Error('the renderer could not decode this image');
        }

        super(element, options);
      }
    },
  };
});

const fetchStub = vi.fn();

/**
 * The real `fetch`, kept because the renderer needs it.
 *
 * satori loads its layout engine as a WebAssembly module through a `fetch` of a
 * `data:` URI. A blanket stub hands that request our 1×1 PNG instead, and the
 * renderer dies with `WebAssembly.instantiate(): expected magic word 00 61 73
 * 6d, found 89 50 4e 47` -- a failure in the *test double*, which reads as a
 * failure of the card. Only the photo host is intercepted here.
 */
const realFetch = globalThis.fetch;
const PHOTO_HOST_PREFIX = 'https://ufs.sh';

/** A photo host that answers with the given status, content type and bytes. */
function respondingWith(status: number, contentType: string, body: Buffer) {
  fetchStub.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).startsWith(PHOTO_HOST_PREFIX)) {
      return realFetch(input, init);
    }

    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': contentType }),
      arrayBuffer: async () => body,
    });
  });
}

/** Requests that went to the photo host, ignoring the renderer's own fetches. */
function photoRequests() {
  return fetchStub.mock.calls.filter(([input]) =>
    String(input).startsWith(PHOTO_HOST_PREFIX)
  );
}

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const { default: image, alt, size, contentType } = await import(
  '../opengraph-image'
);

const PNG_MAGIC = '89504e47';

/**
 * The width and height the PNG itself declares, from its IHDR chunk.
 *
 * Read from the bytes rather than from the `size` export: the export is what
 * `og:image:width` and `og:image:height` claim to a crawler, so a render that
 * disagreed with it would put a false width in the head of every ad page, and
 * nothing else here would notice.
 */
function renderedSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const ad = {
  id: 'ad-1',
  title: 'Pokoj v Kladně',
  city: 'Kladno',
  price: '8000',
  region: 'ST',
  contactPhone: '+420123456789',
  userId: 'seeded-poster-1',
  images: [{ url: 'https://ufs.sh/photo.jpg' }],
};

const params = Promise.resolve({ adId: 'ad-1' });

/** The bytes a crawler would receive, plus the status it would see. */
async function render() {
  const response = await image({ params });
  const body = Buffer.from(await response.arrayBuffer());

  return { response, body };
}

/**
 * The share card for one ad.
 *
 * Rendered for real rather than asserted on as markup: this route's output is a
 * PNG, and a test that never produced one would pass against a card that renders
 * nothing at all. `next/og` runs under Vitest's node environment -- the same
 * `@vercel/og` build the Node runtime loads -- so these are the delivered bytes,
 * about 90 ms each.
 *
 * Two claims get no unit test and are checked in a browser instead: that the
 * Czech text renders as glyphs rather than tofu, and that the layout reads. A
 * PNG cannot be asserted for either, and a snapshot of its bytes would only
 * prove the renderer is deterministic.
 */
describe('the ad share card', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchStub);
    getValidatedAd.mockReset();
    fetchStub.mockReset();
    respondingWith(200, 'image/png', ONE_PIXEL_PNG);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declares the size and type its own meta tags will advertise', () => {
    // `og:image:width` and `og:image:height` come from this export rather than
    // from the render, so a render at a different size would put a lie in the
    // head of every ad page.
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
    expect(alt.length).toBeGreaterThan(0);
  });

  it('renders a PNG for an ad with a photo', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const { response, body } = await render();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(renderedSize(body)).toEqual({ width: 1200, height: 630 });
    expect(body.subarray(0, 4).toString('hex')).toBe(PNG_MAGIC);
    // The photo has to actually reach the renderer, or this and the text-only
    // case below are the same test twice.
    expect(photoRequests()).toHaveLength(1);
  });

  it('renders a different picture with a photo than without one', async () => {
    getValidatedAd.mockResolvedValue(ad);
    const withPhoto = (await render()).body;

    getValidatedAd.mockResolvedValue({ ...ad, images: [] });
    const withoutPhoto = (await render()).body;

    // A card that quietly dropped its photo would still be a valid PNG, and this
    // is the only assertion that can tell the two layouts apart.
    expect(withPhoto.equals(withoutPhoto)).toBe(false);
  });

  it('renders a PNG for an ad with no photo at all', async () => {
    getValidatedAd.mockResolvedValue({ ...ad, images: [] });

    const { response, body } = await render();

    // The other half of the fallback: not every photo-less ad has a broken one,
    // and the card still has to exist.
    expect(response.status).toBe(200);
    expect(body.subarray(0, 4).toString('hex')).toBe(PNG_MAGIC);
    expect(photoRequests()).toHaveLength(0);
  });

  it('still renders a PNG when the photo cannot be loaded', async () => {
    getValidatedAd.mockResolvedValue(ad);
    respondingWith(404, 'text/html', Buffer.from('gone'));

    // Measured: handing satori this URL unanswered 500 for the whole route.
    const { response, body } = await render();

    expect(response.status).toBe(200);
    expect(body.subarray(0, 4).toString('hex')).toBe(PNG_MAGIC);
  });

  it('draws the card without a photo when the renderer fails on one', async () => {
    // The renderer rejecting a photo is the case the fallback exists for, and it
    // is reported while the body is being written -- which is why the route reads
    // the bytes back itself instead of returning the `ImageResponse`.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    getValidatedAd.mockResolvedValue(ad);
    renderer.failNextRender = true;

    const { response, body } = await render();

    expect(response.status).toBe(200);
    expect(body.subarray(0, 4).toString('hex')).toBe(PNG_MAGIC);

    // Logged rather than swallowed: a card that silently stopped showing photos
    // is a regression with nothing else to show for it.
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it('renders different bytes for different ads', async () => {
    // The nearest thing to "the title is on the card" that can be asserted
    // without reading pixels: two ads must not produce the same picture.
    getValidatedAd.mockResolvedValue(ad);
    const first = (await render()).body;

    getValidatedAd.mockResolvedValue({ ...ad, title: 'Pokoj v Mostě' });
    const second = (await render()).body;

    expect(first.equals(second)).toBe(false);
  });

  it('answers 404 for an ad that is gone, and draws nothing', async () => {
    getValidatedAd.mockResolvedValue(null);

    const { response, body } = await render();

    // A removed ad must not keep a live, public, cacheable card carrying its
    // title, price and photo -- the takedown is the point of
    // `deleteAdAsModerator`, and this route is a second surface for it that no
    // assertion on the page could see.
    expect(response.status).toBe(404);
    expect(body).toHaveLength(0);
    expect(photoRequests()).toHaveLength(0);
  });

  it('reads the ad the route was asked for, and nothing else', async () => {
    getValidatedAd.mockResolvedValue(ad);

    await image({ params: Promise.resolve({ adId: 'ad-7' }) });

    // One read, for the one ad on this URL: a card that fetched a page of ads
    // would be a data leak on an image route nobody audits.
    expect(getValidatedAd).toHaveBeenCalledTimes(1);
    expect(getValidatedAd).toHaveBeenCalledWith('ad-7');
  });
});