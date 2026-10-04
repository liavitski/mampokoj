// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const getIndexableAds = vi.fn();
const getValidatedAd = vi.fn();

vi.mock('@/server/queries/select', () => ({
  getIndexableAds: (...args: unknown[]) => getIndexableAds(...args),
  getValidatedAd: (...args: unknown[]) => getValidatedAd(...args),
}));

/**
 * `AdCardCompact` and the modal wrapper are stubbed because importing either
 * pulls in `AdPhotosGallery` -> `deletePhoto` -> `db`, and `db/index.ts` throws
 * on a missing `DATABASE_URL` at import time. These tests are about the
 * metadata a route *exports*; the card's own render tree is covered by its own
 * tests, and asserting on it here would mean standing up a database to say
 * nothing about metadata.
 */
vi.mock('@/components/AdCard/AdCardCompact', () => ({
  default: () => null,
}));
vi.mock('@/app/@modal/(.)ad/[adId]/modal-wrapper', () => ({
  RouteModal: ({ children }: { children: React.ReactNode }) => children,
}));

const { default: sitemap } = await import('@/app/sitemap');
const { default: robots } = await import('@/app/robots');
const { SITEMAP_AD_LIMIT } = await import('@/lib/seo');
const { generateMetadata: generateAdMetadata } = await import(
  '@/app/ad/[adId]/page'
);

/**
 * `sitemap.xml` and `robots.txt`.
 *
 * Both are read by crawlers and by nothing else, which is why neither has ever
 * failed a test: nothing in the app imports them. A sitemap that silently
 * listed every ad's private detail, or a `robots.txt` that accidentally
 * disallowed `/`, would leave the app looking completely healthy.
 *
 * `NEXTAUTH_URL` is pinned per-test rather than read from this machine's
 * `.env`, so the origin in the expectation is one the test chose.
 */
describe('ad page metadata', () => {
  const saved = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';
    getValidatedAd.mockReset();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = saved;
  });

  const ad = {
    id: 'ad-1',
    title: 'Pokoj v Kladně',
    description: 'Velký pokoj v rodinném domě.',
    city: 'Kladno',
    price: '8000',
    availableFrom: new Date('2026-01-15T00:00:00Z'),
    contactPhone: '+420123456789',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    images: [{ url: 'https://ufs.sh/photo.jpg' }],
  };

  it('uses the ad title and a description built from the row', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    expect(meta.title).toBe('Pokoj v Kladně');
    expect(meta.description).toContain('Kladno');
  });

  it('self-references as canonical', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    expect(meta.alternates?.canonical).toBe('/ad/ad-1');
  });

  it('builds an absolute og:url from the site origin', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    expect(meta.openGraph).toMatchObject({
      url: 'https://mampokoj.vercel.app/ad/ad-1',
    });
  });

  it('declares no image of its own, so the generated card is the og:image', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    /**
     * The single most load-bearing assertion about this route.
     *
     * `generate-metadata.md:114` says file-based metadata overrides
     * `generateMetadata`, and against 16.3.6 that is true of a production build
     * and false in development -- measured on the same commit, with the photo
     * present in this object:
     *
     *   pnpm dev          og:image is the photo, and no card is emitted at all
     *   production build  og:image is the generated card, and the photo is dropped
     *
     * So a page that declared both would advertise one picture to a developer and
     * another to every crawler, and the card would be verifiable only against a
     * build. Declaring no image here makes the file convention the sole authority
     * in both environments; that is what this asserts, and putting the photo back
     * does not "improve" the card -- it deletes it in development.
     */
    expect(meta.openGraph).not.toHaveProperty('images');
    expect(meta.twitter).not.toHaveProperty('images');
  });

  it('still declares the title, description and url the card sits beside', async () => {
    // The narrowing above is only about the image. Everything else a share needs
    // -- the text a platform renders next to the picture -- is unchanged, and an
    // `expect(...).toHaveProperty('openGraph')` alone would pass against a
    // metadata object that had lost all of it.
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    expect(meta.openGraph).toMatchObject({
      title: ad.title,
      url: 'https://mampokoj.vercel.app/ad/ad-1',
    });
    expect(meta.twitter).toMatchObject({ title: ad.title });
    expect(meta.description).toContain('Kladno');
  });

  it('has a generated card at the route the og:image will point to', async () => {
    // The other half of the pair above: a page that declares no image *and* has
    // no image convention would advertise no picture at all.
    const image = await import('@/app/ad/[adId]/opengraph-image');

    expect(typeof image.default).toBe('function');
    expect(image.size).toEqual({ width: 1200, height: 630 });
    expect(image.contentType).toBe('image/png');
    expect(image.alt.length).toBeGreaterThan(0);
  });

  it('has a card at the app root, which is what the home page shares', async () => {
    // `/` declares no images either, for the same reason -- and the root
    // segment's card is the one a shared home link gets. `robots.ts` disallows
    // `/dashboard/` and `/moderation`, which inherit this card and are therefore
    // never fetched by anything that would index the picture.
    const image = await import('@/app/opengraph-image');

    expect(typeof image.default).toBe('function');
    expect(image.size).toEqual({ width: 1200, height: 630 });
    expect(image.contentType).toBe('image/png');
  });

  it('asks for a large summary card on Twitter', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  /**
   * A missing ad gets a title and **no `robots` declaration of its own.**
   *
   * The `noindex` for this case comes from the HTTP status: the page calls
   * `notFound()`, which answers 404, and Next.js emits
   * `<meta name="robots" content="noindex">` for any 404 automatically.
   *
   * Declaring it here as well produced *two* robots tags on the page with
   * different values -- `noindex, nofollow` from here and `noindex` from the
   * status -- which is a genuine defect rather than a redundancy: a crawler
   * reading two conflicting directives has no rule for which wins, and the
   * losing one is not knowable in advance.
   *
   * So the status is the single source of truth for this page. The coupling that
   * creates is deliberate and guarded: `noindex-private-routes.test.ts` asserts
   * no `loading.tsx` exists at the app root, and `e2e/ad-detail.spec.ts`
   * measures the 404 status against a real server. If the streaming boundary
   * ever comes back, the status silently becomes 200 and this page becomes
   * indexable -- which is why the root-layout assertion exists rather than a
   * comment here.
   */
  it('declares no robots tag of its own for a missing ad, letting the 404 status speak', async () => {
    getValidatedAd.mockResolvedValue(null);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'missing' }),
    });

    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe('Inzerát nenalezen');
  });

  /**
   * The one that would matter most, stated as a test rather than a comment.
   * `getValidatedAd` selects the whole row including `contactPhone`, and this
   * function receives that row -- so if it ever spread the ad into the
   * metadata, the number would reach every share preview and every crawler.
   */
  it('never puts the contact number in the metadata', async () => {
    getValidatedAd.mockResolvedValue(ad);

    const meta = await generateAdMetadata({
      params: Promise.resolve({ adId: 'ad-1' }),
    });

    expect(JSON.stringify(meta)).not.toContain('+420123456789');
  });
});

describe('the intercepting modal', () => {
  it('has no metadata export, so it cannot compete with the real page', async () => {
    // The modal renders the same card at `/ad/[adId]`. If it ever exported
    // `metadata`, a soft navigation would race two titles into one document.
    const modal = await import('@/app/@modal/(.)ad/[adId]/page');

    expect(modal).not.toHaveProperty('metadata');
    expect(modal).not.toHaveProperty('generateMetadata');
  });
});

describe('sitemap', () => {
  const saved = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';
    getIndexableAds.mockReset();
    getIndexableAds.mockResolvedValue([]);
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = saved;
  });

  it('lists the home page first, so it is the first URL a crawler meets', async () => {
    const entries = await sitemap();

    expect(entries[0]!.url).toBe('https://mampokoj.vercel.app/');
  });

  it('lists every region as its own entry', async () => {
    const entries = await sitemap();
    const regions = entries.filter((e) => e.url.includes('region='));

    // 14 Czech regions. A count rather than a spot check, so dropping one
    // fails here.
    expect(regions).toHaveLength(14);
  });

  it('links each region by its code', async () => {
    const entries = await sitemap();

    expect(entries.map((e) => e.url)).toContain(
      'https://mampokoj.vercel.app/?region=PR'
    );
  });

  it('lists no ad URLs when there are no ads', async () => {
    const entries = await sitemap();

    expect(entries.filter((e) => e.url.includes('/ad/'))).toHaveLength(0);
  });

  it('lists each ad at its detail URL', async () => {
    getIndexableAds.mockResolvedValue([
      { id: 'ad-1', updatedAt: new Date('2026-01-02') },
      { id: 'ad-2', updatedAt: new Date('2026-01-01') },
    ]);

    const entries = await sitemap();

    expect(entries.map((e) => e.url)).toEqual(
      expect.arrayContaining([
        'https://mampokoj.vercel.app/ad/ad-1',
        'https://mampokoj.vercel.app/ad/ad-2',
      ])
    );
  });

  it('uses updatedAt as lastModified, so a takedown gets re-fetched', async () => {
    const updated = new Date('2026-03-04T05:06:07Z');
    getIndexableAds.mockResolvedValue([{ id: 'ad-1', updatedAt: updated }]);

    const entries = await sitemap();

    expect(entries.find((e) => e.url.includes('/ad/'))!.lastModified).toEqual(
      updated
    );
  });

  it('bounds the ad query at SITEMAP_AD_LIMIT', async () => {
    await sitemap();

    expect(getIndexableAds).toHaveBeenCalledWith(SITEMAP_AD_LIMIT);
  });

  /**
   * The negative space that matters. A sitemap entry is a request to be
   * indexed, so a private route appearing here would be the opposite of the
   * intent -- and `robots.ts` would be disallowing a URL this file had just
   * advertised.
   */
  it('never lists a private or non-HTML route', async () => {
    getIndexableAds.mockResolvedValue([
      { id: 'ad-1', updatedAt: new Date('2026-01-01') },
    ]);

    const urls = (await sitemap()).map((e) => e.url).join(' ');

    expect(urls).not.toContain('/dashboard');
    expect(urls).not.toContain('/moderation');
    expect(urls).not.toContain('/api/');
  });

  /**
   * No image sitemaps. `images.url` currently points at seeded files that no
   * longer exist (`HANDOFF.md` §2.2), and advertising dead image URLs to Google
   * is worse than advertising none.
   */
  it('carries no image entries', async () => {
    const entries = await sitemap();

    expect(entries.every((e) => e.images === undefined)).toBe(true);
  });

  it('returns absolute URLs only', async () => {
    getIndexableAds.mockResolvedValue([
      { id: 'ad-1', updatedAt: new Date('2026-01-01') },
    ]);

    for (const entry of await sitemap()) {
      expect(entry.url).toMatch(/^https:\/\//);
    }
  });
});

describe('robots', () => {
  const saved = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = saved;
  });

  it('allows crawling the public site', () => {
    const rules = robots().rules as { allow: string | string[] }[];

    expect(rules[0]!.allow).toBe('/');
  });

  it('keeps crawlers off every private surface', () => {
    const rules = robots().rules as { disallow: string | string[] }[];
    const disallow = rules[0]!.disallow as string[];

    expect(disallow).toContain('/dashboard/');
    expect(disallow).toContain('/moderation');
    expect(disallow).toContain('/api/');
  });

  /**
   * A disallowed *prefix* rather than the bare path. `/dashboard` without the
   * trailing slash would also match `/dashboardsomething`, and — more to the
   * point — would not express that the whole subtree is meant.
   */
  it('disallows the dashboard as a subtree', () => {
    const rules = robots().rules as { disallow: string | string[] }[];

    expect(rules[0]!.disallow).toContain('/dashboard/');
  });

  it('points at its own sitemap, on the same origin', () => {
    expect(robots().sitemap).toBe('https://mampokoj.vercel.app/sitemap.xml');
  });

  it('declares the same host the canonicals use', () => {
    expect(robots().host).toBe('https://mampokoj.vercel.app');
  });
});