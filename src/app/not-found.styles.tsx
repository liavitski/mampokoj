'use client';

/**
 * The presentational half of the 404 page.
 *
 * A separate module because `not-found.tsx` exports `metadata`, which only a
 * Server Component can do, and a module with `'use client'` cannot export it.
 * Same split as `page.styles.tsx` and `AdCardCompact.styles.tsx`, and the same
 * rule: do not move these back together.
 */
import styled from 'styled-components';

export const Header = styled.h3`
  text-align: center;
`;