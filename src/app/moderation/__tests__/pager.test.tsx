// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const getAllAds = vi.fn();
const getReportedAds = vi.fn();

vi.mock('@/server/queries/select', () => ({
  getAllAds: (...args: unknown[]) => getAllAds(...args),
  getReportedAds: (...args: unknown[]) => getReportedAds(...args),
}));

const { requireUserId } = vi.hoisted(() => ({
  requireUserId: vi.fn().mockResolvedValue('moderator-1'),
}));
vi.mock('@/lib/session', () => ({ requireUserId }));

// The allowlist is read from the environment at request time, so this is the only
// way to get past the gate without a real OAuth session.
vi.mock('@/lib/moderator-guard', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/moderator-guard')>(
      '@/lib/moderator-guard'
    );

  return { ...actual, isModerator: () => true };
});

vi.mock('@/components/moderation/TakeDownButton', () => ({ default: () => null }));
vi.mock('@/components/moderation/MarkCheckedButton', () => ({
  default: () => null,
}));
vi.mock('@/components/moderation/RemoveCheckButton', () => ({
  default: () => null,
}));

const { default: ModerationPage } = await import('@/app/moderation/page');
const { PAGE_SIZE } = await import('@/constants');

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-01-15T10:00:00.000Z';

/**
 * The all-ads pager, rendered rather than read.
 *
 * This list was the newest `PAGE_SIZE` of two hundred with nothing past them, so
 * "I cannot find that scam" was a conclusion a moderator could draw *correctly*
 * from a truncated list. That is the defect these tests exist to keep fixed.
 *
 * Rendered to static markup because the thing being asserted is markup -- where
 * the links point and what the page claims about itself. The gate's *ordering* is
 * the opposite problem and is asserted by source read in `moderation-gate.test.ts`,
 * because a page that renders "Not allowed." after querying has already leaked the
 * data, and rendering cannot see that.
 */
describe('the moderation all-ads pager', () => {
  beforeEach(() => {
    getAllAds.mockReset();
    getReportedAds.mockReset();
    getReportedAds.mockResolvedValue([]);
    getAllAds.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });

  const ad = (id: string) => ({
    id,
    userId: 'u',
    title: `Ad ${id}`,
    price: '8000.00',
    city: 'Praha',
    region: 'PR',
    contactPhone: '+420776123456',
    description: 'A room.',
    createdAt: new Date(AT),
    checkedAt: null,
  });

  /**
 * `params: Promise.resolve({})` because `PageProps<'/moderation'>` declares it.
 * `/moderation` has no dynamic segment, so the router resolves `params` to `{}`
 * -- `page.md`, "Static routes resolve `params` to `{}`" -- and the page never
 * reads it.
 */
  const render = async (
    searchParams: Record<string, string | string[] | undefined> = {}
  ) =>
    renderToStaticMarkup(
      await ModerationPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve(searchParams),
      })
    );

  it('asks for the first page when there is no cursor', async () => {
    await render();

    expect(getAllAds).toHaveBeenCalledWith(PAGE_SIZE, undefined);
  });

  it('asks for one page, whatever the cursor says', async () => {
    await render({ cursorCreatedAt: AT, cursorId: ID });

    // A cursor that could move the bound would turn a hand-edited URL into a
    // table dump on a route that selects every contact number on the site.
    expect(getAllAds.mock.calls[0]![0]).toBe(PAGE_SIZE);
  });

  it('passes a valid cursor through', async () => {
    await render({ cursorCreatedAt: AT, cursorId: ID });

    expect(getAllAds.mock.calls[0]![1]).toEqual({ createdAt: new Date(AT), id: ID });
  });

  /**
   * The pager has to survive the same junk the home page now does. An error page
   * on `/moderation` is worse than one on the grid: it is where a moderator is
   * mid-triage, and it is the page holding every contact number on the site.
   */
  it.each([
    ['a non-uuid id', { cursorCreatedAt: AT, cursorId: 'not-a-uuid' }],
    ['a non-date timestamp', { cursorCreatedAt: 'not-a-date', cursorId: ID }],
    ['a lone id', { cursorId: ID }],
    ['a lone timestamp', { cursorCreatedAt: AT }],
  ])('falls back to the newest page for %s', async (_case, searchParams) => {
    getAllAds.mockResolvedValue({
      items: [ad('a')],
      hasMore: false,
      nextCursor: null,
    });

    const html = await render(searchParams as Record<string, string>);

    expect(getAllAds.mock.calls[0]![1]).toBeUndefined();
    expect(html).toContain('This is every ad on the site.');
    expect(html).not.toContain('Newest ads');
  });

  it('offers a way to the older ads when there are more', async () => {
    getAllAds.mockResolvedValue({
      items: [ad('a'), ad('b')],
      hasMore: true,
      nextCursor: { createdAt: new Date(AT), id: 'b' },
    });

    const html = await render();

    // Both parameters, and the id of the last row *of the page* -- the value the
    // query handed back, not a recomputed one. A cursor one row off skips or
    // repeats exactly one ad, silently.
    //
    // `URLSearchParams` percent-encodes the colons in the timestamp, which is
    // correct and also what `?cursorCreatedAt=` decodes back to; the `&` arrives
    // escaped because this is HTML.
    expect(html).toContain(`cursorCreatedAt=${encodeURIComponent(AT)}`);
    expect(html).toContain('cursorId=b');
    expect(html).toContain('Older ads');
  });

  it('offers no forward link on the last page', async () => {
    // A full page that is also the last page. Linking onward from here would
    // offer a click that returns nothing.
    getAllAds.mockResolvedValue({
      items: [ad('a')],
      hasMore: false,
      nextCursor: null,
    });

    const html = await render();

    expect(html).not.toContain('Older ads');
  });

  /**
   * The only way back. A keyset cursor names a position and cannot be
   * decremented, so this is not a nicety -- without it a moderator who has paged
   * three times has no route back to the newest ads except editing the URL.
   */
  it('offers a way back to the newest ads once paged', async () => {
    getAllAds.mockResolvedValue({
      items: [ad('a')],
      hasMore: true,
      nextCursor: { createdAt: new Date(AT), id: 'a' },
    });

    const html = await render({ cursorCreatedAt: AT, cursorId: ID });

    expect(html).toContain('href="/moderation"');
    expect(html).toContain('Newest ads');
  });

  it('does not offer a way back from the first page', async () => {
    const html = await render();

    expect(html).not.toContain('Newest ads');
  });

  /**
   * The honesty property, in both directions. The page used to say "showing the
   * most recent 10", which was true and still wrong once a pager existed: a
   * moderator reading it would keep believing the list was cut off.
   */
  it('claims completeness only when there is no next page', async () => {
    getAllAds.mockResolvedValue({
      items: [ad('a')],
      hasMore: true,
      nextCursor: { createdAt: new Date(AT), id: 'a' },
    });

    const truncated = await render();

    getAllAds.mockResolvedValue({
      items: [ad('a')],
      hasMore: false,
      nextCursor: null,
    });

    const complete = await render();

    expect(truncated).not.toContain('This is every ad on the site.');
    expect(truncated).toContain('Older ads are behind');
    expect(complete).toContain('This is every ad on the site.');
  });

  it('tells a paged moderator they are not at the start', async () => {
    getAllAds.mockResolvedValue({
      items: [ad('a')],
      hasMore: true,
      nextCursor: { createdAt: new Date(AT), id: 'a' },
    });

    const html = await render({ cursorCreatedAt: AT, cursorId: ID });

    expect(html).toContain('Continuing back through the list');
  });

  it('still renders the reported queue, which is not paged', async () => {
    // The queue is deliberately left whole: a report asks for attention, and the
    // moderator's job is to clear all of it.
    getReportedAds.mockResolvedValue([
      { ...ad('r'), reportedAt: new Date(AT) },
    ]);

    const html = await render({ cursorCreatedAt: AT, cursorId: ID });

    expect(html).toContain('Reported ads');
    expect(getReportedAds).toHaveBeenCalledWith();
  });
});