'use client';
import * as React from 'react';

import styled from 'styled-components';
import { QUERIES } from '@/constants';
import RegionSelect from '../RegionSelect/RegionSelect';
import { CZ_REGIONS } from '@/constants';
import { useRouter } from 'next/navigation';

type RegionSelectBlockProps = {
  currentRegion?: string;
};

function RegionSelectBlock({
  currentRegion,
}: RegionSelectBlockProps) {
  const router = useRouter();

  function handleRegionChange(value: string) {
    const href = `/?region=${value}`;
    router.push(href);
  }

  return (
    <Wrapper>
      <RegionSelect
        data={CZ_REGIONS}
        value={currentRegion ?? ''}
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
