'use client';

/**
 * The browse grid's loading state, deliberately **not at the app root.**
 *
 * It used to be `src/app/loading.tsx`, which put a Suspense boundary above
 * *every* route in the app. That is what made `/ad/[adId]` answer **HTTP 200
 * for an ad that does not exist** (`HANDOFF.md` §9.4): with a boundary in the
 * way, Next flushes the response head before the page's own data has loaded, so
 * by the time `getValidatedAd` returned null and `notFound()` threw, the status
 * line had already gone out as 200. The visitor saw a correct 404 page and
 * every crawler, uptime monitor and CDN saw a success -- and because a 200 gets
 * no automatic `noindex`, a removed listing also stayed indexable.
 *
 * **Why this is a file in a `(browse)` group rather than the home page's own
 * `loading.tsx`.** The obvious fix -- move `loading.tsx` down beside `page.tsx`
 * -- was tried and **breaks the intercepting modal**, which is the reason this
 * comment is here rather than a `git log` line nobody reads.
 *
 * `@modal/(.)ad/[adId]` intercepts `/ad/[adId]`, and `(.)` means "the same
 * route-segment level" relative to the slot's owner. Route groups count toward
 * that level even though they add no URL segment. So moving the home page into
 * `(browse)` put it one level deeper and `(.)ad` stopped resolving: clicking a
 * card did a full page navigation instead of opening the modal. The URL still
 * changed, so only the assertions that the *grid is still mounted behind the
 * dialog* noticed.
 *
 * Re-aiming the matcher does not work either -- `(..)ad/[adId]` is rejected at
 * the root level ("Cannot use (..) marker at the root level").
 *
 * So the home page stays at `src/app/page.tsx`, at the level the matcher
 * expects, and this spinner lives in a group that the ad route is not part of.
 * `e2e/ad-detail.spec.ts` asserts the 404 status; the modal specs in the same
 * file assert the interception still works. Both must stay green together -- if
 * you are about to move the home page into `(browse)`, run those first.
 */

import React from 'react';

import Spinner from '@/components/Spinner';
import styled from 'styled-components';
import RegionNavigation from '@/components/RegionNavigation';
import { QUERIES } from '@/constants';

function Loading() {
  return (
    <Wrapper>
      <MainColumn>
        <Spinner size={32}/>
      </MainColumn>

      <LeftColumn>
        <RegionNavigation />
      </LeftColumn>
    </Wrapper>
  );
}
const Wrapper = styled.main`
  display: flex;
  flex-direction: row-reverse;
`;

const MainColumn = styled.div`
  flex: 1;
`;

const LeftColumn = styled.aside`
  flex-basis: 248px;

  @media ${QUERIES.tabletAndSmaller} {
    display: none;
  }
`;




export default Loading;
