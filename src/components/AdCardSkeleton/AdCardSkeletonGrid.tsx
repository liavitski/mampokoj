import React from 'react';

import { range } from '@/utils/utils';
import styled from 'styled-components';
import AdCardSkeleton from './AdCardSkeleton';

async function AdCardSkeletonGrid() {
  return (
    <CardsWrapper>
      {range(0, 9).map((num) => (
        <AdCardSkeleton key={num} />
      ))}
    </CardsWrapper>
  );
}

const CardsWrapper = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
`;

export default AdCardSkeletonGrid;
