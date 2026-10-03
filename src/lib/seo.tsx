import 'server-only';

import { CZ_REGIONS } from '@/constants';
import type { RegionCode } from '@/types/db-types';
import { formatPriceCZK } from '@/utils/utils';

/**
 * The site's absolute origin, and the Czech copy its metadata is written in.
 *
 * Every URL a crawler reads -- canonicals, `og:url`, sitemap entries, the
 * sitemap pointer in robots.txt -- has to be absolute, and it has to name the
 * origin the page was actually served from. Getting that wrong is the quietest
 * SEO failure there is: nothing errors, the page looks fine in a browser, and
 * the index quietly records a canonical pointing at localhost or at a preview
 * deployment. So it is resolved in one place and every caller goes through
 * `absoluteUrl`.
 */

/**
 * Used only when neither `NEXTAUTH_URL` nor `VERCEL_URL` yields a usable
 * origin. Dev machines that have neither set, and the app has to render.
 */
const FALLBACK_ORIGIN = 'http://localhost:3000';

/**
 * One absolute origin: scheme and host, no path.
 *
 * `URL.origin` is what makes this safe to compose with `absoluteUrl` -- a
 * `NEXTAUTH_URL` carrying a path would otherwise prefix every generated URL,
 * and this app has no base path to carry.
 *
 * Returns `null` rather than throwing, because this runs during `next build`.
 * An unusable origin must not fail a build: a Preview deployment with no
 * `NEXTAUTH_URL` still has a correct `VERCEL_URL`, and one with neither should
 * fall back rather than refuse to compile. The cost of falling back is stated
 * here so nobody reads the fallback as acceptable in production -- see
 * `siteOrigin`.
 */
function parseOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  // `VERCEL_URL` arrives as a bare host with no scheme, so a schemeless value
  // is assumed to be production HTTPS rather than rejected.
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

/**
 * The origin to build absolute URLs from.
 *
 * `NEXTAUTH_URL` first, deliberately: it is the one variable this app already
 * treats as the canonical origin (`env-check.tsx` calls it "Canonical origin"),
 * it is set in both environments by hand, and reusing it means SEO needs no new
 * variable and therefore no new entry in the Vercel dashboard. `HANDOFF.md` §1
 * records how expensive a variable missing from the dashboard is.
 *
 * `VERCEL_URL` second, which covers exactly the gap the first leaves: Preview
 * deployments that inherit no dashboard value, where the hand-set
 * `NEXTAUTH_URL` would otherwise emit production canonicals into a throwaway
 * URL -- which is how a preview gets itself indexed as the real site.
 *
 * The fallback is a dev convenience and a production bug. It is last so that
 * reaching it means both variables are missing, which is a state `env:check`
 * already reports for `NEXTAUTH_URL`.
 */
export function siteOrigin(): string {
  return (
    parseOrigin(process.env.NEXTAUTH_URL) ??
    parseOrigin(process.env.VERCEL_URL) ??
    FALLBACK_ORIGIN
  );
}

/** An absolute URL for a site-relative path. Leading slash optional. */
export function absoluteUrl(path = '/'): string {
  return new URL(path, `${siteOrigin()}/`).toString();
}

/**
 * The site's one-line description, shared by the root layout, the home page's
 * metadata and the sitemap.
 *
 * Czech because that is who the app is for: prices are quoted in CZK, dates in
 * `cs-CZ`, and every region has a Czech name the UI could be showing instead
 * of the English one. The single English description this app had was the last
 * English-only string in a Czech product.
 *
 * The site's *name* is not declared here -- `APP_TITLE` in `constants.tsx` is
 * that, and a second constant holding the same two words is a second thing to
 * forget to change.
 */
export const SITE_DESCRIPTION =
  'Pokoj k pronájmu v České republice. Prohlížejte nabídky podle krajů a domluvte se přímo s pronajímatelem.';

/**
 * Ad count in the sitemap, and why it is not "all of them".
 *
 * The sitemap exists so a crawler can *find* listings, not to enumerate a
 * database. Google caps a sitemap at 50,000 URLs, and a site with more than
 * about 5,000 pages should paginate the sitemap rather than send one enormous
 * file. This app is nowhere near that and currently holds ~200 generated rows,
 * so the honest bound is "the newest slice worth a crawler's attention" rather
 * than a number derived from a page count. Raise it deliberately, with the
 * 50,000 ceiling in mind, rather than by making it match the table.
 */
export const SITEMAP_AD_LIMIT = 100;

/** The Czech name of a region code, or null when the code is not one of ours. */
export function regionName(code: string | undefined): string | null {
  if (!code) return null;

  const region = CZ_REGIONS.find((r) => r.code === code);

  return region ? region.name_cs : null;
}

/** Narrows an arbitrary string to a region code, for callers that validated. */
export function asRegionCode(code: string | undefined): RegionCode | null {
  return code && regionName(code) !== null ? (code as RegionCode) : null;
}

/**
 * Truncate to a length search results can actually show.
 *
 * Cut on a word boundary rather than mid-word, and marked with an ellipsis so
 * a truncated description is visibly truncated instead of reading as complete.
 *
 * The 160-char budget is Google's practical limit for a description snippet;
 * the exact figure is a guideline that changes without notice, so this is a
 * budget rather than a promise of what is displayed.
 */
export function clampText(text: string, max = 160): string {
  /**
   * Collapses *ASCII* whitespace only, and never touches U+00A0.
   *
   * `\s` matches the non-breaking space, so a plain `replace(/\s+/g, ' ')`
   * silently rewrote `Intl`'s cs-CZ currency output -- "8 000 Kč" with a
   * non-breaking space became "8 000 Kč" with an ordinary one, which is a
   * break opportunity the formatter had deliberately removed. A search result
   * showing "8" at the end of one line and "000 Kč" on the next is the kind of
   * thing nobody traces back to this function.
   *
   * Carriage returns and newlines still collapse, which is the actual reason
   * this function exists to do it: an ad description pasted with hard line
   * breaks would otherwise pad itself past the budget with whitespace.
   */
  const collapsed = text
    .replace(/[ \t\r\n\v\f]+/g, ' ')
    .replace(/^ +| +$/g, '');

  if (collapsed.length <= max) return collapsed;

  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');

  // Only respect the word boundary if it leaves most of the budget in place;
  // a single very long token would otherwise truncate to almost nothing.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;

  return `${body.trimEnd()}…`;
}

/**
 * The home page's title and description, in Czech, for the region being viewed.
 *
 * A region page that kept the home page's generic title would be fourteen
 * pages competing for one query string. Naming the region is most of what
 * makes `/?region=PR` worth a distinct listing at all.
 *
 * Falls back to the site's generic pair when the region is absent *or* invalid.
 * The invalid case is deliberate: `page.tsx` renders "No ads found for this
 * region" for it, and a title claiming a Prague listing that does not exist
 * would be worse than a generic one.
 */
export function homeMeta(regionCode?: string): { title: string; description: string } {
  const name = regionName(regionCode);

  if (!name) {
    return {
      title: 'Pokoj k pronájmu',
      description: SITE_DESCRIPTION,
    };
  }

  return {
    title: `Pronájem pokoje a bytu v ${name}`,
    description: `Nabídky na pronájem pokoje v kraji ${name}. Prohlížejte inzeráty, filtujte podle města a kontaktujte pronajímatele přímo.`,
  };
}

/** The fields a description can be built from, without the whole row. */
export type DescribableAd = {
  title: string;
  description: string;
  city: string;
  price: string | number;
  availableFrom: Date | string;
};

/** A date as `YYYY-MM-DD`, in UTC, for `availableFrom`-derived copy. */
function isoDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * An ad's meta description: its own text, then the two facts a searcher
 * filters on, then the date it becomes available.
 *
 * Written from the row rather than from the card so it carries `availableFrom`
 * and the exact price even where the card summarises. Clamped, because a
 * 2,000-character ad description is a description no result will show in
 * full -- and an unclamped one truncates mid-word in the SERP.
 */
export function adMetaDescription(ad: DescribableAd): string {
  const facts = [
    `${ad.city}`,
    formatPriceCZK(ad.price),
    `od ${isoDate(ad.availableFrom)}`,
  ].join(' · ');

  return clampText(`${ad.description} — ${facts}`);
}

/**
 * `schema.org/InStock` or `PreOrder` from the date a room becomes available.
 *
 * A room whose `availableFrom` has passed is one a visitor can move into now,
 * which is what InStock means for this product. A future date is a room that
 * cannot be had yet, which is what PreOrder means. The alternative -- omitting
 * `availability` -- leaves a crawler unable to tell the two apart.
 */
export function adAvailability(availableFrom: Date | string): string {
  const available = new Date(availableFrom).getTime();

  return Number.isNaN(available) || available <= Date.now()
    ? 'https://schema.org/InStock'
    : 'https://schema.org/PreOrder';
}