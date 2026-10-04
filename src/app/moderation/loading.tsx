import {
  Wrapper,
  Heading,
  Section,
  SectionHeading,
  Queue,
  QueueItem,
  Skeleton,
  SkeletonBar,
  VisuallyHiddenText,
} from './page.styles';

/**
 * `/moderation`'s loading state.
 *
 * A Server Component, per `loading.md:32`. `(browse)/loading.tsx` is
 * `'use client'` because it renders `RegionNavigation`, which needs to be
 * interactive while the grid streams in; nothing here does, so there is no
 * reason to hand a static skeleton to the browser as JavaScript.
 *
 * **Why this route can have a loading boundary and `/ad/[adId]` cannot.** A
 * `loading.tsx` is not free. `loading.md:101-122` is explicit that the response
 * starts streaming when a fallback renders, that this sends the headers, and
 * that `notFound()` afterwards "cannot update the status code of the response" —
 * so a missing ad would answer **200** with a 404 page inside it. That is
 * HANDOFF §9.4, and `noindex-private-routes.test.ts` asserts the ad route has no
 * boundary for exactly this reason.
 *
 * `/moderation` is safe because it never throws `notFound()` or `redirect()`.
 * The refusal path renders `<h3>Not allowed.</h3>` — a 200 either way, so
 * streaming changes nothing about it. That is a property of the page rather than
 * a property of this file, so `loading.test.tsx` pins it: add a `notFound()` to
 * `page.tsx` and the day this skeleton goes up, the queue goes soft-404.
 *
 * Two things are real rather than greyed out: the headings, because they are
 * static text the server already knows, and the grid, because it is imported
 * from the page's own styles. A moderator sees which page is loading and where
 * the lists will be before either query answers, and the content lands in a
 * layout that is already the right shape.
 */
function Loading() {
  return (
    <Wrapper role="status" aria-live="polite" aria-busy="true">
      <VisuallyHiddenText>Loading the moderation queue.</VisuallyHiddenText>

      <Heading>Moderation</Heading>

      {/* `aria-hidden` on the queues, not on the page: the placeholders are
          decoration, and a screen reader walking six empty list items learns
          nothing that the sentence above has not already said. */}
      <Section $column={2}>
        <SectionHeading>Reported ads</SectionHeading>
        <Queue aria-hidden="true">
          <QueueItem>
            <Skeleton>
              <SkeletonBar $width="80%" />
              <SkeletonBar $width="45%" />
              <SkeletonBar $width="30%" />
            </Skeleton>
          </QueueItem>
          <QueueItem>
            <Skeleton>
              <SkeletonBar $width="70%" />
              <SkeletonBar $width="40%" />
              <SkeletonBar $width="30%" />
            </Skeleton>
          </QueueItem>
        </Queue>
      </Section>

      <Section $column={1}>
        <SectionHeading>All ads</SectionHeading>
        <Queue aria-hidden="true">
          <QueueItem>
            <Skeleton>
              <SkeletonBar $width="85%" />
              <SkeletonBar $width="50%" />
              <SkeletonBar $width="30%" />
            </Skeleton>
          </QueueItem>
          <QueueItem>
            <Skeleton>
              <SkeletonBar $width="75%" />
              <SkeletonBar $width="45%" />
              <SkeletonBar $width="30%" />
            </Skeleton>
          </QueueItem>
          <QueueItem>
            <Skeleton>
              <SkeletonBar $width="80%" />
              <SkeletonBar $width="55%" />
              <SkeletonBar $width="30%" />
            </Skeleton>
          </QueueItem>
        </Queue>
      </Section>
    </Wrapper>
  );
}

export default Loading;