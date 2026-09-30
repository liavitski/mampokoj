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
export const Wrapper = styled.article`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  padding: 16px;
  border-radius: 16px;
  gap: 16px;
  display: flex;
  height: max-content;

  /*
    This one is capped, and centred rather than left-aligned, because it is
    rendered in two places with different widths: as the whole of /ad/[adId],
    where the wrapper decides the measure, and inside the modal's scroll area,
    which is as wide as the viewport. max-width plus auto margins gives the
    same centred card in both, where 'width: min(800px, 95vw)' left it pinned
    to the left edge of the modal.
  */
  width: 100%;
  max-width: 800px;
  margin-inline: auto;

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
    'price price';
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto auto auto auto;
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