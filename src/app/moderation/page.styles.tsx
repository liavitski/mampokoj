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

import { WEIGHTS, QUERIES } from '@/constants';

export const Wrapper = styled.section`
  width: 100%;
  max-width: 800px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const Heading = styled.h1`
  font-size: 1.25rem;
  font-weight: ${WEIGHTS.medium};
  margin-bottom: 8px;
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

export const Title = styled.span`
  font-size: 1.125rem;
  font-weight: ${WEIGHTS.medium};
  color: var(--color-text);
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
`;
