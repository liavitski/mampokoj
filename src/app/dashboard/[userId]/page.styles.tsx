'use client';

import styled from 'styled-components';

/**
 * The dashboard route's layout. It lives here because the route is an `async`
 * Server Component and a module with `'use client'` cannot be async -- and
 * styled-components rules declared in an async server module are written into
 * the RSC payload and never reach the document at all. See
 * `MaxWidthWrapper.tsx` for the full account.
 *
 * Do not move these back into the route file.
 */
export const Wrapper = styled.div`
  display: flex;
  gap: 16px;
  flex-direction: column;
`;

export const AdCardWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px dotted var(--color-border);
  padding-bottom: 16px;
`;

export const AdControlButtonsWrapper = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-start;

  /*
    Was capped at 800px while the card above it filled the page wrapper, so the
    three buttons under it stopped well short of the card's right edge.
  */
  width: 100%;
`;