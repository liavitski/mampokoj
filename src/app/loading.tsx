import React from 'react';

import Spinner from '@/components/Spinner';
import styled from 'styled-components';
import RegionNavigation from '@/components/RegionNavigation';
import { QUERIES } from '@/constants';

function Loading() {
  return (
    <Wrapper>
      <MainColumn>
        <Spinner />
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
