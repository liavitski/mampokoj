'use client';
import * as React from 'react';

import styled from 'styled-components';
import { QUERIES } from '@/constants';
import RegionSelect from '../RegionSelect/RegionSelect';
import { CZ_REGIONS } from '@/constants';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type RegionSelectBlockProps = {
  currentRegion?: string;
};

function RegionSelectBlock({
  currentRegion,
}: RegionSelectBlockProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [region, setRegion] = React.useState(currentRegion);

  function handleRegionChange(value: string) {
    if (isPending) return;

    const href = `/?region=${value}`;
    setRegion(value);

    router.push(href);
  }

  return (
    <Wrapper>
      <RegionSelect
        data={CZ_REGIONS}
        value={region}
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
