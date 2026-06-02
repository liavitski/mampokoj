import * as React from 'react';
import AdSummaryCard from '../AdSummaryCard';
import styled from 'styled-components';
import { getAdsWithImages } from '@/server/queries/select';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

async function AdGrid() {
  const adsWithImages = await getAdsWithImages();
  const session = await getServerSession(authOptions);

  return (
    <Wrapper>
      {adsWithImages.map((adWithImage) => (
        <AdSummaryCard key={adWithImage.id} ad={adWithImage} asLink={true} />
      ))}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
`;

export default AdGrid;
