import * as React from 'react';
import type { AdWithImages } from '@/types/db-types';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';
import AdPhotosGallery from '../AdPhotosGallery';

type AdCardProps = {
  ad: AdWithImages;
};

function AdCard({ ad }: AdCardProps) {
  const {
    id,
    userId,
    title,
    price,
    city,
    region,
    availableFrom,
    description,
    contactPhone,
    createdAt,
    updatedAt,
    images,
  } = ad;

  const formattedPrice = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Number(price));

  return (
    <Wrapper>
      <AdPhotosGallery photos={images} />
      <InfoWrapper>
        <Title>{title}</Title>
        <Description>{description}</Description>
        <City>
          City: <span>{city}</span>
        </City>
      </InfoWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.article`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  padding: 16px;
  display: flex;
  gap: 16px;
  position: relative;
  max-width: 1000px;
  height: 520px;
`;

const InfoWrapper = styled.div`
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-areas:
    'title title'
    'description description'
    'city city';
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 36px 1fr 36px;
`;

const Title = styled.h2`
  grid-area: title;
  font-size: 1.25rem;
  font-weight: ${WEIGHTS.medium};
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Description = styled.p`
  grid-area: description;
  font-size: 1rem;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const City = styled.p`
  grid-area: city;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

export default AdCard;
