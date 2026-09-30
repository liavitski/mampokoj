'use client';

import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';

/**
 * The home route's layout. It lives here because `app/page.tsx` is an `async`
 * Server Component and a module with `'use client'` cannot be async -- and
 * styled-components rules declared in an async server module are written into
 * the RSC payload and never reach the document at all. See
 * `MaxWidthWrapper.tsx` for the full account.
 *
 * Do not move these back into `app/page.tsx`.
 */
export const Wrapper = styled.main`
  display: flex;
  gap: 16px;

  @media ${QUERIES.tabletAndSmaller} {
    flex-direction: column;
  }
`;

export const MainColumn = styled.div`
  flex: 1;
`;

export const LeftColumn = styled.aside`
  flex-basis: 248px;

  @media ${QUERIES.tabletAndSmaller} {
    display: none;
  }
`;

export const NoAdsText = styled.p`
  font-weight: ${WEIGHTS.medium};
  font-size: 1rem;
  text-align: center;
`;