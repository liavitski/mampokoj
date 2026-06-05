import * as React from 'react';
import type { AdWithImages } from '@/types/db-types';
import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';
import AdPhotosGallery from '../AdPhotosGallery';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { formatCZPhone } from '@/utils/utils';

type AdCardProps = {
  ad: AdWithImages;
};

async function AdCard({ ad }: AdCardProps) {
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

  const session = await getServerSession(authOptions);

  const formattedPrice = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Number(price));

  const formattedPhone = formatCZPhone(contactPhone);

  return (
    <Wrapper>
      <AdPhotosGallery photos={images} />

      <InfoWrapper>
        <Title>{title}</Title>
        <Description>{description}</Description>
        <City>
          <span>City:</span> {city}
        </City>
        <ContactPhone>
          <span>Contact:</span>
          {session ? formattedPhone : 'Log in to see the contact'}
        </ContactPhone>

        <Price>
          <span>Price: </span>
          {formattedPrice}
        </Price>
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
  gap: 16px;

  max-width: 1000px;

  @media (${QUERIES.tabletAndSmaller}) {
    min-width: 100%;
    min-width: 0;
    flex-direction: column;
  }

  @media ${QUERIES.phoneAndSmaller} {
    border-radius: 0;
  }
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

const ContactPhone = styled.p`
  grid-area: contact;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;
const Price = styled.p`
  grid-area: price;
  font-size: 1rem;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

export default AdCard;
