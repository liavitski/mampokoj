import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';

import RegionNavigation from '@/components/RegionNavigation';
import AdCardSkeletonGrid from '@/components/AdCardSkeleton/AdCardSkeletonGrid';

export default async function Loading() {
  return (
    <Wrapper>
      <MainColumn>
        <AdCardSkeletonGrid />
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

const Text = styled.p`
  font-weight: ${WEIGHTS.medium};
  font-size: 1rem;
  text-align: center;
`;
