// @vitest-environment node

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  absoluteUrl,
  adAvailability,
  adMetaDescription,
  asRegionCode,
  clampText,
  homeMeta,
  regionName,
  SITE_DESCRIPTION,
  siteOrigin,
} from '@/lib/seo';

/**
 * What these tests catch.
 *
 * Every one of them is about a value that reaches a crawler. Nothing here is
 * cosmetic: `siteOrigin` decides whether the index records
 * `mampokoj.vercel.app` or `localhost:3000` as the canonical origin of every
 * page on the site, and that failure is invisible in a browser.
 *
 * `absoluteUrl` and the origin tests set and restore `NEXTAUTH_URL` explicitly
 * rather than reading whatever this machine happens to have in `.env`, so the
 * expected value in the assertion is one the test itself chose. A test that
 * asserted against the ambient env could pass against a wrong origin.
 */
describe('siteOrigin', () => {
  const saved = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses NEXTAUTH_URL as the canonical origin', () => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';

    expect(siteOrigin()).toBe('https://mampokoj.vercel.app');
  });

  it('strips a trailing slash rather than double-slashing every URL', () => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app/';

    expect(absoluteUrl('/sitemap.xml')).toBe(
      'https://mampokoj.vercel.app/sitemap.xml'
    );
  });

  it('drops any path from the origin', () => {
    // A base path here would prefix every canonical and sitemap URL. The app
    // has none, and `URL.origin` is what guarantees that rather than trusting
    // the operator to have typed a bare host.
    process.env.NEXTAUTH_URL = 'https://example.com/some/path';

    expect(siteOrigin()).toBe('https://example.com');
  });

  /**
   * The Preview-deployment case, and the reason this fallback exists at all.
   *
   * Vercel provides `VERCEL_URL` as a bare host with no scheme. Without this,
   * a Preview deployment that inherits no `NEXTAUTH_URL` would fall back to
   * localhost and advertise its own throwaway URL as canonical -- or, worse,
   * emit production canonicals and get *itself* indexed as the real site.
   */
  it('falls back to VERCEL_URL, assuming https for a bare host', () => {
    process.env.VERCEL_URL = 'mampokoj-git-feature-abc123.vercel.app';

    expect(siteOrigin()).toBe('https://mampokoj-git-feature-abc123.vercel.app');
  });

  it('prefers NEXTAUTH_URL over VERCEL_URL when both are set', () => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';
    process.env.VERCEL_URL = 'preview.vercel.app';

    expect(siteOrigin()).toBe('https://mampokoj.vercel.app');
  });

  it('ignores an unparseable origin instead of building URLs from it', () => {
    // `http://` alone parses as a URL with no host, which would produce
    // "http:///sitemap.xml". Garbage in, no silent garbage out.
    process.env.NEXTAUTH_URL = 'not a url at all';
    process.env.VERCEL_URL = 'https://fallback.vercel.app';

    expect(siteOrigin()).toBe('https://fallback.vercel.app');
  });

  it('falls back to localhost only when nothing usable is set', () => {
    expect(siteOrigin()).toBe('http://localhost:3000');
  });
});

describe('absoluteUrl', () => {
  const saved = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://mampokoj.vercel.app';
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = saved;
  });

  it('builds an absolute URL from a root-relative path', () => {
    expect(absoluteUrl('/ad/abc')).toBe('https://mampokoj.vercel.app/ad/abc');
  });

  it('defaults to the site root', () => {
    expect(absoluteUrl()).toBe('https://mampokoj.vercel.app/');
  });

  it('normalises a single slash between origin and path', () => {
    expect(absoluteUrl('/sitemap.xml')).not.toContain('//sitemap');
  });
});

describe('regionName', () => {
  it('returns the Czech name for a known code', () => {
    // The Czech name, not the English one: this string reaches `<title>` and
    // `og:title` for every region page, and `name_en` is what the sidebar
    // shows a user rather than what a search result should read as.
    expect(regionName('PR')).toBe('Hlavní město Praha');
  });

  it('returns null for a code that is not a region', () => {
    expect(regionName('XX')).toBeNull();
  });

  it('returns null when no region was given', () => {
    expect(regionName(undefined)).toBeNull();
  });
});

describe('asRegionCode', () => {
  it('narrows a known code', () => {
    expect(asRegionCode('JM')).toBe('JM');
  });

  it('returns null rather than casting an unknown code', () => {
    expect(asRegionCode('XX')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(asRegionCode(undefined)).toBeNull();
  });
});

describe('homeMeta', () => {
  it('names the region so region pages are not 14 copies of one title', () => {
    const { title, description } = homeMeta('PR');

    expect(title).toContain('Hlavní město Praha');
    expect(description).toContain('Hlavní město Praha');
  });

  it('uses the site description when no region is given', () => {
    expect(homeMeta().description).toBe(SITE_DESCRIPTION);
  });

  /**
   * The invalid-region case. `page.tsx` renders "No ads found for this region"
   * for a bad code, so a title naming a region would advertise a listing that
   * does not exist.
   */
  it('falls back to the generic pair for an unknown region', () => {
    const { title, description } = homeMeta('NOPE');

    expect(title).not.toContain('NOPE');
    expect(description).toBe(SITE_DESCRIPTION);
  });

  it('never leaks a cursor parameter into the title', () => {
    expect(homeMeta('PR').title).not.toMatch(/cursor/i);
  });
});

describe('clampText', () => {
  it('leaves short text alone', () => {
    expect(clampText('Pokoj v Praze')).toBe('Pokoj v Praze');
  });

  it('collapses whitespace, so a description cannot pad its way past the budget', () => {
    expect(clampText('a\n\n   b')).toBe('a b');
  });

  /**
   * The one that bit: `\s` matches U+00A0, so collapsing it rewrote the
   * non-breaking space inside `Intl`'s currency output and gave the price back
   * a line-break opportunity the formatter had removed. Found by the price
   * test above rather than by reading the code.
   */
  it('leaves a non-breaking space alone', () => {
    expect(clampText('8 000 Kč')).toBe('8 000 Kč');
  });

  it('trims', () => {
    expect(clampText('  padded  ')).toBe('padded');
  });

  it('cuts on a word boundary and marks the cut', () => {
    const result = clampText('slovo '.repeat(60), 40);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(41);
    // Not mid-word: the character before the ellipsis is not a partial word.
    expect(result.slice(0, -1).trim().split(' ').at(-1)).toBe('slovo');
  });

  it('still truncates a single token too long for the budget', () => {
    // Guards the `lastSpace > max * 0.6` branch: with no space at all, the
    // fallback must still produce something bounded rather than the whole
    // string.
    const result = clampText('x'.repeat(300), 50);

    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('adMetaDescription', () => {
  const ad = {
    title: 'Pokoj ve Středočeském kraji',
    description: 'Velký pokoj v rodinném domě, wifi v ceně.',
    city: 'Kladno',
    price: '8000',
    availableFrom: new Date('2026-01-15T00:00:00Z'),
  };

  it('includes the description, the city and the price', () => {
    const result = adMetaDescription(ad);

    expect(result).toContain('wifi v ceně');
    expect(result).toContain('Kladno');
    // U+00A0, because `Intl` groups and separates cs-CZ currency with it. A
    // regular space here would make this test fail on a *correct* formatter.
    expect(result).toContain('8 000');
  });

  it('states the availability date', () => {
    expect(adMetaDescription(ad)).toContain('2026-01-15');
  });

  it('is bounded, so a 2000-character ad cannot produce a 2000-character snippet', () => {
    const result = adMetaDescription({
      ...ad,
      description: 'dlouhý popis '.repeat(300),
    });

    expect(result.length).toBeLessThanOrEqual(161);
  });

  it('formats the price the same way the cards do', () => {
    // The point of `formatPriceCZK` living in one place: a search result
    // reading "8 000 Kč" beside a card reading "8,000.00 Kč" is a defect
    // nobody would notice until they compared the two.
    expect(adMetaDescription(ad)).toContain(
      new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: 'CZK',
        maximumFractionDigits: 0,
      }).format(8000)
    );
  });

  it('accepts a string price, which is what the numeric column returns', () => {
    // `numeric(10, 2)` arrives as a string like "8000.00", and `maximumFractionDigits:
    // 0` is what makes both that and "8000" render as the same whole koruna.
    expect(adMetaDescription({ ...ad, price: '8000.00' })).toContain('8 000');
  });
});

describe('adAvailability', () => {
  it('is InStock for a date already past', () => {
    expect(adAvailability(new Date('2020-01-01T00:00:00Z'))).toBe(
      'https://schema.org/InStock'
    );
  });

  it('is PreOrder for a date still ahead', () => {
    const future = new Date(Date.now() + 86_400_000);

    expect(adAvailability(future)).toBe('https://schema.org/PreOrder');
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(adAvailability('2020-01-01T00:00:00Z')).toBe(
      'https://schema.org/InStock'
    );
  });

  /**
   * An unparseable date resolves to InStock rather than to PreOrder.
   *
   * `PreOrder` is the claim that a room cannot be had yet, so defaulting to it
   * on bad input would be asserting something false about a listing. The
   * `numeric(10,2)`/`timestamp` columns do not produce invalid dates in
   * practice; this is about the failure mode if one ever did.
   */
  it('treats an unparseable date as available rather than pre-order', () => {
    expect(adAvailability('not a date')).toBe('https://schema.org/InStock');
  });
});