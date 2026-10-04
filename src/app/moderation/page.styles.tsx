'use client';

/**
 * The presentational half of the moderation page.
 *
 * A separate module because `page.tsx` is an `async` Server Component, and a
 * module with `'use client'` cannot be. The same reason
 * `AdCardCompact.styles.tsx` is split out, and the same rule: do not move these
 * back.
 */
import styled from 'styled-components';
import Link from 'next/link';

import { WEIGHTS, QUERIES } from '@/constants';

/**
 * The page shell: a CSS grid, two columns wide on a desktop.
 *
 * A grid rather than two floated or flexed columns because the two lists have to
 * sit side by side at one height while still being able to overflow into the
 * page's own scroll. Nested scroll areas are the alternative and are a trackpad
 * trap, so `Section` explicitly does not create one.
 *
 * The 1200px cap is for the two-column case. It was 800px when the page held a
 * single list, and two columns inside 800px would be ~390px each -- narrower than
 * a phone, which is the width this page is explicitly designed to fall back to.
 * The 800px is kept for the single-column layout rather than replaced, so the
 * phone layout is unchanged rather than merely still readable.
 */
export const Wrapper = styled.section`
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 16px;

  @media ${QUERIES.tabletAndSmaller} {
    /*
     * One column. Reported ads first, all ads second -- the order they are
     * written in the page, because Section drops its placement below this
     * width. No grid-row juggling needed, and none wanted: DOM order is the
     * single-column behaviour, which is why the desktop layout is expressed as
     * explicit placement rather than as source order.
     */
    grid-template-columns: minmax(0, 1fr);
    max-width: 800px;
  }
`;

/**
 * The page title, spanning both columns on the row above them.
 *
 * Both halves of that placement are load-bearing, and the row number is the one
 * that is easy to miss. `1 / -1` alone is not enough: the two `Section`s are
 * explicitly placed on row 1, so an auto-placed heading that spans the full width
 * no longer fits there and grid pushes it down to the first row where the full
 * width is free -- rendering the page title *underneath* both lists, at the very
 * bottom of a 3000px page. Pinning the heading to row 1 and the sections to row 2
 * is what makes the order explicit rather than negotiated.
 */
export const Heading = styled.h1`
  grid-column: 1 / -1;
  grid-row: 1;
  font-size: 1.25rem;
  font-weight: ${WEIGHTS.medium};
  margin-bottom: 8px;
`;

/**
 * One list, in one grid cell.
 *
 * `$column` places it on the desktop layout; `grid-row: 2` puts both lists on the
 * same row -- below the heading, which owns row 1 -- so they sit side by side
 * rather than stacked inside one column. Both are undone below the tablet
 * breakpoint, and the reset has to live in this same rule *after* the placement --
 * a one-column grid that still says `grid-column: 2` does not stack, it grows an
 * implicit second column and leaves the reported list stranded beside an empty
 * one.
 *
 * `min-width: 0` because grid and flex items default to `min-width: auto`: one
 * long unbroken ad title would push its column wider than its neighbour and the
 * two lists would end up different widths. Zero lets the text wrap.
 *
 * No `overflow` and no `max-height`, deliberately. Letting the columns scroll
 * independently is the tempting option and the wrong one -- a scroll area inside
 * the page scroll is a trackpad trap, and it hides the end of a queue behind a
 * second gesture. The page scrolls as one.
 */
export const Section = styled.div<{ $column: 1 | 2 }>`
  grid-column: ${({ $column }) => $column};
  grid-row: 2;

  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media ${QUERIES.tabletAndSmaller} {
    grid-column: auto;
    grid-row: auto;
  }
`;

/**
 * The per-list heading, one level below `Heading`.
 *
 * An `h2` rather than a second `h1` because the page has two lists and a title:
 * the document outline is "Moderation > Reported ads" and "Moderation > All ads",
 * which is what a screen reader's heading list will report. Two `h1`s would say
 * the page has two names.
 */
export const SectionHeading = styled.h2`
  font-size: 1.0625rem;
  font-weight: ${WEIGHTS.medium};
  color: var(--color-text);
  margin-top: 8px;
`;

/**
 * Marks a row whose check state differs from the default.
 *
 * A visual cue only -- the button in the row is what actually acts on it, and
 * this text is not a status anyone can rely on programmatically. It exists so a
 * moderator scanning the list can see at a glance which ads have already been
 * ruled on, which is otherwise only discoverable by opening each dialog.
 */
export const Badge = styled.span`
  display: inline-block;
  /*
   * align-self because QueueItem is a flex column, whose items stretch to
   * the full width by default. Without this the badge renders edge to edge and
   * reads as an empty text input rather than a label -- which is exactly how it
   * looked before this line existed.
   */
  align-self: flex-start;
  font-size: 0.75rem;
  font-weight: ${WEIGHTS.medium};
  color: var(--color-text-muted-foreground);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0 8px;
`;

/**
 * A caveat about what the page is showing rather than about any ad.
 *
 * Deliberately muted and never an error: `getAllAds` is bounded on principle and
 * paged, and a moderator who believes they have seen every ad will draw wrong
 * conclusions from a list showing the newest ten. Saying where they are is the
 * difference between a paged list and a misleading one.
 */
export const Note = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-muted-foreground);
`;

/**
 * The two pager links.
 *
 * A `nav` region with the links inside it rather than two bare anchors: a
 * moderator paging with a keyboard or a screen reader should be able to jump
 * between "Newest ads" and "Older ads" without tabbing past every ad in
 * between, and only a labelled region offers that. `aria-label` because the
 * links' own text ("Older ads") says nothing about *which* list they page --
 * there are two lists on this page and only one of them pages.
 */
export const Pager = styled.nav`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`;

/**
 * A pager link.
 *
 * `AdLink` rather than the shared `Button`: these navigate, and navigating is
 * what a link is for. A button-styled control that changes the URL would leave
 * middle-click and "open in new tab" -- the two ways a moderator gets back to the
 * ad they just took down -- doing nothing at all.
 */
export const PagerLink = styled(Link)`
  font-size: 0.875rem;
  font-weight: ${WEIGHTS.medium};
  color: var(--color-link);

  &:hover {
    color: var(--color-link-hover);
  }
`;

export const Empty = styled.p`
  font-size: 1rem;
  color: var(--color-text-muted-foreground);
`;

export const Queue = styled.ul`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const QueueItem = styled.li`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media ${QUERIES.phoneAndSmaller} {
    /* On a phone the row would squeeze the number and the button into
       something unreadable. */
    flex-direction: column;
  }
`;

export const Meta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.875rem;
  color: var(--color-text-muted-foreground);
`;

/**
 * An ad's title, which is a link to the ad as a visitor sees it.
 *
 * Link-coloured rather than the `Title` body colour it replaces: it navigates, so
 * it has to look like something that navigates. A title painted as plain text is
 * a link the eye skips straight over, which defeats the point of adding it.
 */
export const AdLink = styled.a`
  font-size: 1.125rem;
  font-weight: ${WEIGHTS.medium};
  color: var(--color-link);

  &:hover {
    color: var(--color-link-hover);
  }
`;

/**
 * Text only a screen reader reads.
 *
 * A local `span` rather than the shared `VisuallyHidden` component: that one is
 * `'use client'` with a keydown listener, and using it here would put a client
 * boundary on a string that never changes -- which would hand this whole Server
 * Component page a client component for no reason.
 */
export const VisuallyHiddenText = styled.span`
  position: absolute;
  overflow: hidden;
  clip: rect(0 0 0 0);
  height: 1px;
  width: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
`;

export const Phone = styled.a`
  font-size: 1rem;
  color: var(--color-link);

  &:hover {
    color: var(--color-link-hover);
  }
`;

export const Row = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

/*
 * The loading state's placeholders. `loading.tsx` imports these from here rather
 * than defining its own so the fallback and the page cannot drift apart: same
 * grid, same row, same bar geometry, and the content swaps into a layout that is
 * already the right shape.
 *
 * These live at the end of the file, below the real page, because they are the
 * only part of it that renders with no data behind them.
 */

/**
 * A column of placeholder bars standing in for one row's contents.
 *
 * Sized to the row it replaces — title, two meta lines, the number — so the
 * fallback is roughly as tall as the queue that replaces it and the swap does
 * not move anything.
 */
export const Skeleton = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
`;

/**
 * One grey bar.
 *
 * `$width` is a length rather than a percentage because the bars are meant to
 * differ from each other: three bars the same width read as a table, where the
 * real rows have a long title and two short ones. Varying them says "text of
 * unknown length" instead.
 *
 * `--color-border` for the fill, on `--color-card-background` behind it: the
 * border token is already the app's "a line you can see against this surface"
 * value in both themes, so the fallback follows light and dark without a second
 * set of tokens. Deliberately not animated — a pulsing skeleton on a page whose
 * data is two queries is motion spent on nothing, and `globals.css` already
 * collapses transitions under `prefers-reduced-motion` anyway.
 */
export const SkeletonBar = styled.div<{ $width: string }>`
  width: ${({ $width }) => $width};
  height: 12px;
  border-radius: 6px;
  background-color: var(--color-border);
`;
