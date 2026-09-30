'use client';

import styled from 'styled-components';

/**
 * `MainColumn.tsx` is an `async` Server Component -- it awaits `getAds()` -- and
 * a module with `'use client'` cannot be async. Styled definitions that live in
 * an async server module are written into the RSC payload and never reach the
 * document, because a Server Component never re-renders on the client to inject
 * them. See `MaxWidthWrapper.tsx` for the full account.
 *
 * Do not move these back into `MainColumn.tsx`.
 */
export const Wrapper = styled.div`
  flex: 1;
`;