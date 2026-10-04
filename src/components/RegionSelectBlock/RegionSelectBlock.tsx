'use client';
import * as React from 'react';

import styled from 'styled-components';
import { QUERIES } from '@/constants';
import RegionSelect from '../RegionSelect/RegionSelect';
import { CZ_REGIONS } from '@/constants';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { RegionCode } from '@/types/db-types';

type RegionSelectBlockProps = {
  currentRegion?: string;
};

function RegionSelectBlock({
  currentRegion,
}: RegionSelectBlockProps) {
  const router = useRouter();

  /**
   * `value` arrives from Radix as a bare `string`, and `typedRoutes` cannot
   * narrow that -- the only way through is a cast, so the question is which
   * type to cast *to*.
   *
   * `RegionCode` rather than `Route`. The claim being asserted is a domain one
   * ("this is one of the fourteen codes the select was populated from",
   * `data={CZ_REGIONS}` above), and because `href` is then annotated `Route`
   * the resulting fourteen-way union is still checked against the generated
   * route table. `as Route` on the finished string would silence `push` while
   * checking nothing, and would also silence it if `CZ_REGIONS` and the URL
   * disagreed later.
   */
  function handleRegionChange(value: string) {
    const href: Route = `/?region=${value as RegionCode}`;
    router.push(href);
  }

  return (
    <Wrapper>
      <RegionSelect
        data={CZ_REGIONS}
        // `undefined` rather than '' -- Radix reserves the empty string and
        // treats a controlled empty value as no selection at all.
        value={currentRegion}
        onValueChange={handleRegionChange}
      />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: none;

  @media ${QUERIES.tabletAndSmaller} {
    display: block;
    align-self: flex-end;
  }
`;

export default RegionSelectBlock;
