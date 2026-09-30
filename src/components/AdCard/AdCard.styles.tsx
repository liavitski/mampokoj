'use client';

import styled from 'styled-components';
import { WEIGHTS, QUERIES } from '@/constants';

/**
 * The presentational half of `AdCard`.
 *
 * `AdCard.tsx` is an `async` Server Component -- it awaits `getSessionUser()` --
 * and a module with `'use client'` cannot be async. So its styled definitions
 * live here, in a module that can: importing them makes them client references,
 * which means the rules are generated in the client pass and reach the document
 * as real CSS. Keeping them in the async file produced a styled-components rule
 * that was written into the RSC payload and never applied, at all.
 *
 * Do not move these back into `AdCard.tsx`.
 */
export const Wrapper = styled.article`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  padding: 16px;
  border-radius: 16px;
  display: flex;
  gap: 16px;

  /*
    Was 'width: min(800px, 95vw)'. On the dashboard that left the card as an
    800px island inside the page wrapper -- left-aligned, with a few hundred
    pixels of empty gutter to its right -- while the header rule above it ran
    the full width of the wrapper. The wrapper decides the measure now; a
    component inside it should fill it.
  */
  width: 100%;
  height: max-content;

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