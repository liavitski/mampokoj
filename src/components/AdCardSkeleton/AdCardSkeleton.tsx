import * as React from 'react';

import styled from 'styled-components';
import { WEIGHTS } from '@/constants';
import { redactedScript } from '@/utils/fonts';
import { QUERIES } from '@/constants';

function AdCardSkeleton() {
  return (
    <Wrapper className={redactedScript.className}>
      <RoomImage />

      <InfoWrapper>
        <Title>Lorem ipsum dolor sit amet.</Title>
        <Description>
          Lorem ipsum dolor sit amet consectetur adipiscing elit. Sit
          amet consectetur adipiscing elit quisque faucibus ex.
          Adipiscing elit quisque faucibus ex sapien vitae
          pellentesque.
        </Description>
        <City>
          <span>City:</span> Lorem ipsum.
        </City>
      </InfoWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.article`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  padding: 16px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 420px;

  @media (${QUERIES.tabletAndSmaller}) {
    width: min(600px, 95vw);
    flex-direction: column;
  }
`;

const RoomImage = styled.div`
  position: relative;
  flex: 1;
  margin-bottom: 12px;
`;

const InfoWrapper = styled.div`
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-areas:
    'title title'
    'description description'
    'city city'
    'contact contact'
    'price price';
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto auto auto auto;
`;

const Title = styled.h2`
  grid-area: title;
  font-size: 1.25rem;
  font-weight: ${WEIGHTS.medium};
  margin-bottom: 8px;
`;

const Description = styled.p`
  grid-area: description;
  font-size: 1rem;
  margin-bottom: 8px;
`;

const City = styled.p`
  grid-area: city;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

export default AdCardSkeleton;
