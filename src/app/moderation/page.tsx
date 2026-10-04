import { requireUserId } from '@/lib/session';
import { isModerator, parseModeratorAllowlist } from '@/lib/moderator-guard';
import { getAllAds, getReportedAds } from '@/server/queries/select';
import { cursorParamsSchema, toAdsCursor } from '@/lib/validation/cursor';
import { PAGE_SIZE } from '@/constants';

import type { Metadata } from 'next';

/**
 * Never indexed, and never linked.
 *
 * `robots.ts` disallows `/moderation`, which stops a compliant crawler
 * fetching it -- and which is exactly why the `noindex` here is not redundant.
 * A URL excluded in `robots.txt` cannot have its `noindex` read, so it can sit
 * in an index as "indexed, though blocked by robots.txt", which is worse than
 * either state. The tag is what actually removes it, and it is what a scraper
 * or a link-preview fetcher will honour.
 *
 * `follow: false` as well, unlike the 404 page: there is no reason for a
 * crawler to walk onward from the only page on the site whose rows carry every
 * ad's contact number.
 */
export const metadata: Metadata = {
  title: 'Moderace',
  robots: { index: false, follow: false },
};

import TakeDownButton from '@/components/moderation/TakeDownButton';
import MarkCheckedButton from '@/components/moderation/MarkCheckedButton';
import RemoveCheckButton from '@/components/moderation/RemoveCheckButton';

import {
  Wrapper,
  Heading,
  Section,
  SectionHeading,
  Empty,
  Note,
  Badge,
  Queue,
  QueueItem,
  Meta,
  AdLink,
  VisuallyHiddenText,
  Phone,
  Row,
  Pager,
  PagerLink,
} from './page.styles';

/**
 * One ad's title, linking to the ad as a visitor sees it.
 *
 * `target="_blank"` because a moderator works a queue by position: the page is
 * rendered from the server, so navigating away loses their place in it and
 * re-runs both queries on the way back. `rel="noopener noreferrer"` is not
 * optional decoration here -- without `noopener` the opened ad gets a
 * `window.opener` reference back to `/moderation`, a route whose rows carry every
 * ad's contact phone number, and the referrer would leak the moderator's visit
 * besides.
 *
 * The public detail page rather than anything moderator-flavoured: what settles a
 * report is the listing as anybody else receives it, photos and "Report ad" button
 * included.
 */
function AdTitle({ adId, title }: { adId: string; title: string }) {
  return (
    <AdLink href={`/ad/${adId}`} target="_blank" rel="noopener noreferrer">
      {title}
      {/* No browser affordance warns a keyboard or screen-reader user that a
          second tab just opened, and the surprise is disorienting enough to lose
          someone's place in the queue. Invisible on screen. */}
      <VisuallyHiddenText>(opens in a new tab)</VisuallyHiddenText>
    </AdLink>
  );
}

/**
 * The moderation page: every reported ad, and every ad on the site.
 *
 * Not an admin UI -- no user management, no content editing, no dashboards --
 * which is what HANDOFF §9.5 excludes. It is two lists and three buttons, and the
 * buttons are what make the reports worth filing.
 *
 * The second list is the addition, and it rests on a distinction worth stating:
 * reporting is a safety net, not a prerequisite for moderation. A moderator who
 * can see an obvious scam should be able to remove it without waiting for a
 * stranger to file a report first -- `deleteAdAsModerator` has always been able to
 * delete any ad, and before this list the only ads it could be aimed at were the
 * ones somebody had already complained about. So every row in both lists offers
 * the same three answers: take it down, mark it checked, or leave it alone.
 *
 * "Mark checked" is the third answer, and the reason the reported queue can be
 * worked through rather than only drained. Reading a report and concluding the ad
 * is genuine is a real outcome, and before this the only way to record it was to
 * delete nothing and re-check the page an hour later to find the report still
 * there. Marking an ad checked clears its report and makes it unreportable, so
 * the queue empties for the right reason too.
 *
 * Gated on the `MODERATORS` allowlist *before* either query, for the reason
 * `canViewDashboard` is checked before `getUserAds`: this is a route whose data
 * is selected by something other than the session, and the check is the only
 * thing between an anonymous visitor and every reported ad's contact number.
 * Checking afterwards would mean the queries had already run. The all ads list
 * selects `contactPhone` for every ad on the site, so it is gated the same way and
 * the ordering is asserted in `moderation-gate.test.ts` separately for each query.
 *
 * `<h3>Not allowed.</h3>` rather than `notFound()` or a redirect, because that
 * is the app's one existing convention for a refused page and a second
 * convention would be its own defect. It is also the more honest answer: the
 * route exists, and pretending otherwise teaches nothing.
 */
async function ModerationPage({ searchParams }: PageProps<'/moderation'>) {
  const serverUserId = await requireUserId();

  if (
    !isModerator(serverUserId, parseModeratorAllowlist(process.env.MODERATORS))
  ) {
    return <h3>Not allowed.</h3>;
  }

  /**
   * Untrusted input, read after the gate purely so the function reads in the
   * order it happens: refuse first, then look at what was asked for, then query.
   * Nothing security-relevant turns on that order -- `searchParams` is not the
   * session, and reading it cannot read a row.
   *
   * Parsed by the same schema the home page and `/api/ads` use, because it is the
   * same cursor -- same `(createdAt, id)` order, same "both or neither" rule. An
   * unreadable one falls back to the newest page here exactly as it does there,
   * so `/moderation?cursorId=not-a-uuid` is a working page rather than a 500.
   */
  const { cursorCreatedAt, cursorId } = await searchParams;
  const parsedCursor = cursorParamsSchema.safeParse({ cursorCreatedAt, cursorId });
  const cursor = parsedCursor.success ? toAdsCursor(parsedCursor.data) : undefined;

  /**
   * Both queries after the gate, and together: they are independent reads on the
   * same table and the moderator needs both on one screen, so there is nothing to
   * sequence. `Promise.all` rather than two awaits so a slow all ads query does
   * not hold the reported queue back behind it.
   *
   * Only the all-ads list is paged. The queue is deliberately left whole: a report
   * is a request for attention, and the moderator's job is to clear all of it, so
   * a second page of reports is a queue that has quietly outgrown a ten-row cap.
   */
  const [reportedAds, allAdsPage] = await Promise.all([
    getReportedAds(),
    getAllAds(PAGE_SIZE, cursor),
  ]);

  const { items: allAds, hasMore, nextCursor } = allAdsPage;

  return (
    <Wrapper>
      <Heading>Moderation</Heading>

      {/*
        Written reported-first, all-ads second. That is the order they stack on a
        phone, and the order they are read in: a moderator opens this page to deal
        with a report, so the queue is first even though the all ads list is wider
        on screen. The desktop layout is expressed as explicit placement on
        `Section` rather than by swapping the source order, so one arrangement
        serves both widths.

        `fr` rather than a fixed column width so the queue gets the same 1fr as
        the list: it is usually shorter, and stretching it to match would leave a
        column of blank space beside it.
      */}
      <Section $column={2}>
        <SectionHeading>Reported ads</SectionHeading>

        {reportedAds.length === 0 ? (
          <Empty>Nothing has been reported.</Empty>
        ) : (
          <Queue>
            {reportedAds.map((ad) => (
              <QueueItem key={ad.id}>
                <Meta>
                  <AdTitle adId={ad.id} title={ad.title} />
                  <span>
                    {ad.city} &middot; posted{' '}
                    {new Intl.DateTimeFormat('cs-CZ').format(ad.createdAt)}
                  </span>
                  <span>reported {formatWhen(ad.reportedAt)}</span>
                </Meta>

                {/*
                  The number unblurred, deliberately. A moderator is deciding
                  whether this is a scam, and the number is the reason it was
                  reported -- this is the one place `contactPhone` is shown as-is,
                  which is why `getReportedAds` selects it at all.
                */}
                <Phone href={`tel:${ad.contactPhone.replace(/\s/g, '')}`}>
                  {ad.contactPhone}
                </Phone>

                <Row>
                  {/*
                    Three verdicts, because a report can end three ways. Take it
                    down if it is a scam; mark it checked if reading it showed the
                    ad is genuine, which clears the report and stops anyone filing
                    another; or do neither, which leaves it in the queue to look at
                    again later.
                  */}
                  <MarkCheckedButton adId={ad.id} />
                  <TakeDownButton adId={ad.id} />
                </Row>
              </QueueItem>
            ))}
          </Queue>
        )}
      </Section>

      <Section $column={1}>
        <SectionHeading>All ads</SectionHeading>

        {allAds.length === 0 ? (
          <Empty>No ads yet.</Empty>
        ) : (
          <>
            <Queue>
              {allAds.map((ad) => (
                <QueueItem key={ad.id}>
                  <Meta>
                    <AdTitle adId={ad.id} title={ad.title} />
                    <span>
                      {ad.city} &middot; posted{' '}
                      {new Intl.DateTimeFormat('cs-CZ').format(ad.createdAt)}
                    </span>
                  </Meta>

                  {/* The same number, and for the same reason. */}
                  <Phone href={`tel:${ad.contactPhone.replace(/\s/g, '')}`}>
                    {ad.contactPhone}
                  </Phone>

                  {/*
                    Which button, not whether to show the row. Every ad is in this
                    list whatever its state; the only thing `checkedAt` decides is
                    whether the moderator's next move is to make an ad solid or to
                    take that decision back.

                    This is a branch on presentation, not a filter -- filtering on
                    the report happens in the query, before the rows are read. See
                    the assertion in `moderation-gate.test.ts`.
                  */}
                  {ad.checkedAt ? <Badge>checked</Badge> : null}

                  <Row>
                    {ad.checkedAt ? (
                      <RemoveCheckButton adId={ad.id} />
                    ) : (
                      <MarkCheckedButton adId={ad.id} />
                    )}
                    <TakeDownButton adId={ad.id} />
                  </Row>
                </QueueItem>
              ))}
            </Queue>

            {/*
              Two links and a sentence, which is the whole pager.

              "Older ads" walks forward in time with a keyset cursor, so it cannot
              skip or repeat a row when a moderator deletes an ad off the list
              above. "Newest ads" drops the cursor and returns to the first page,
              which is the only way back: a keyset cursor names a position and
              cannot be decremented, so there is no "previous page" to link to and
              pretending otherwise would either lose the moderator's place or
              reintroduce the offset paging this avoids.

              No page numbers either, for the same reason. "Page 3 of 20" needs an
              `OFFSET` or a `COUNT` over the whole table, and both make the number
              move under the moderator -- a number that lies is worse than no
              number. What is offered instead is the truth: where you are in the
              ordering, and how to leave.
            */}
            <Pager>
              {cursor ? <PagerLink href="/moderation">Newest ads</PagerLink> : null}

              {hasMore && nextCursor ? (
                <PagerLink
                  href={`/moderation?${new URLSearchParams({
                    cursorCreatedAt: nextCursor.createdAt.toISOString(),
                    cursorId: nextCursor.id,
                  }).toString()}`}
                >
                  Older ads
                </PagerLink>
              ) : null}
            </Pager>

            {/*
              Load-bearing, and the reason it is not a generic caption. The list
              used to be the newest ten of two hundred with no way past them, so
              "I cannot find that scam" was a reasonable conclusion drawn from a
              list that was simply cut off. Whatever this says, it must never let
              a moderator believe they have seen the whole site when they have
              not -- so the completeness claim appears only when `hasMore` is
              false, and a truncated list says how to get further.
            */}
            <Note>
              {cursor
                ? 'Continuing back through the list, oldest last. "Newest ads" starts over.'
                : hasMore
                  ? `Newest first, ${PAGE_SIZE} at a time. Older ads are behind "Older ads".`
                  : 'Newest first. This is every ad on the site.'}
            </Note>
          </>
        )}
      </Section>
    </Wrapper>
  );
}

/** Relative, because "3 days ago" is the useful answer for a triage queue. */
function formatWhen(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';

  return `${days} days ago`;
}

export default ModerationPage;
