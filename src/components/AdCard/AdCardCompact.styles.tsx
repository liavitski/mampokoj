'use client';

import styled from 'styled-components';
import { WEIGHTS, QUERIES } from '@/constants';

/**
 * The presentational half of `AdCardCompact`. See `AdCard.styles.tsx` for why
 * these cannot live next to the component that renders them: the component is
 * an `async` Server Component, and a module with `'use client'` cannot be.
 *
 * Do not move these back into `AdCardCompact.tsx`.
 */
/*
  Rendered in two places, and the box around it differs:

    - as the whole of /ad/[adId], with no dialog around it, so this Wrapper *is*
      the card and needs its own surface, border, shadow and padding;
    - inside the modal, whose Content is now a real box with the same four
      properties. Keeping them here as well drew a card within a card.

  So the surface properties live here and are removed for the modal by the
  `:where([data-modal-box] *)` rules at the bottom, rather than being duplicated
  per surface. `data-modal-box` is set by Modal.tsx; if it is renamed, this
  selector has to change with it or the nested-card regression comes back.
*/
export const Wrapper = styled.article`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  padding: 16px;
  border-radius: 16px;
  gap: 16px;
  display: flex;

  /*
    min-height: 100% rather than height: max-content, so the card fills the
    modal's fixed-height box when its content is short (leaving the frame even)
    and grows past it when it is long, at which point the modal's ScrollArea
    takes over. height: max-content is what let the dialog's visible size track
    its content.

    Only inside the modal, though -- see the [data-modal-box] override below.
    Unconditionally it would be a percentage of an auto-height parent on
    /ad/[adId], which resolves to nothing and would collapse the card.

    No backticks in this comment: it is inside a template literal, so one would
    close the string and take the rest of the stylesheet with it.
  */

  /*
    Capped, and centred rather than left-aligned, because it is rendered at two
    widths: as the whole of /ad/[adId], where this wrapper decides the measure,
    and inside the modal's scroll area. max-width plus auto margins gives the
    same centred card in both, where 'width: min(800px, 95vw)' left it pinned to
    the left edge of the modal.
  */
  width: 100%;
  max-width: 800px;
  margin-inline: auto;

  /*
    Inside the modal the box supplies the surface, and the box also decides the
    height, so the card fills it rather than sizing itself to its content.

    An ancestor selector, not a descendant one: this has to match the Wrapper
    itself, and CSS cannot select an element on the basis of its own ancestry
    without :has().
  */
  [data-modal-box] & {
    background-color: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
    max-width: none;
    min-height: 100%;
  }

  @media ${QUERIES.tabletAndSmaller} {
    flex-direction: column;
  }
`;

export const InfoWrapper = styled.div`
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-areas:
    'title title'
    'description description'
    'city city'
    'contact contact'
    'price price'
    'report report';
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto auto auto auto auto;
`;

export const Title = styled.h2`
  grid-area: title;
  font-size: 1.25rem;
  font-weight: ${WEIGHTS.medium};
  margin-bottom: 8px;
`;

export const Description = styled.p`
  grid-area: description;
  font-size: 1rem;
  margin-bottom: 8px;
  font-weight: ${WEIGHTS.normal};
`;

export const City = styled.p`
  grid-area: city;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

export const ContactPhone = styled.p`
  grid-area: contact;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

export const Price = styled.p`
  grid-area: price;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

/**
 * The report control's row.
 *
 * Inside InfoWrapper rather than beside the gallery, so the modal's box owns
 * the surface the same way it does for everything else in the card. Pushed to
 * the end because it is the last thing to want on a page, and given a top margin
 * because the price above it is the thing a reader came for.
 */
export const ReportRow = styled.div`
  grid-area: report;
  display: flex;
  justify-content: flex-start;
  margin-top: 12px;
`;