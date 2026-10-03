import { requireUserId } from '@/lib/session';
import { isModerator, parseModeratorAllowlist } from '@/lib/moderator-guard';
import { getReportedAds } from '@/server/queries/select';

import TakeDownButton from '@/components/moderation/TakeDownButton';

import {
  Wrapper,
  Heading,
  Empty,
  Queue,
  QueueItem,
  Meta,
  Title,
  Phone,
  Row,
} from './page.styles';

/**
 * The moderation queue: every ad somebody has reported, newest first.
 *
 * Not an admin UI -- no user management, no content editing, no dashboards --
 * which is what HANDOFF §9.6 excludes. It is a list and one button, and the
 * button is what makes the reports worth filing.
 *
 * Gated on the `MODERATORS` allowlist *before* the query, for the reason
 * `canViewDashboard` is checked before `getUserAds`: this is a route whose data
 * is selected by something other than the session, and the check is the only
 * thing between an anonymous visitor and every reported ad's contact number.
 * Checking afterwards would mean the query had already run.
 *
 * `<h3>Not allowed.</h3>` rather than `notFound()` or a redirect, because that
 * is the app's one existing convention for a refused page and a second
 * convention would be its own defect. It is also the more honest answer: the
 * route exists, and pretending otherwise teaches nothing.
 */
async function ModerationPage() {
  const serverUserId = await requireUserId();

  if (
    !isModerator(serverUserId, parseModeratorAllowlist(process.env.MODERATORS))
  ) {
    return <h3>Not allowed.</h3>;
  }

  const reportedAds = await getReportedAds();

  if (reportedAds.length === 0) {
    return (
      <Wrapper>
        <Heading>Reported ads</Heading>
        <Empty>Nothing has been reported.</Empty>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Heading>Reported ads</Heading>

      <Queue>
        {reportedAds.map((ad) => (
          <QueueItem key={ad.id}>
            <Meta>
              <Title>{ad.title}</Title>
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
              <TakeDownButton adId={ad.id} />
            </Row>
          </QueueItem>
        ))}
      </Queue>
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
