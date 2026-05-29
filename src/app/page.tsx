import styled from 'styled-components';
import RegionNavigation from '@/components/RegionNavigation';
import AdGrid from '@/components/AdGrid';
import { QUERIES } from '@/constants';

export default async function Home() {
  return (
    <Wrapper>
      <MainColumn>
        <AdGrid />
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
  align-items: baseline;
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
