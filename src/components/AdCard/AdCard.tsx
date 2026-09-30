import * as React from 'react';
import { formatCZPhone } from '@/utils/utils';

import type { AdWithImages } from '@/types/db-types';

import { getSessionUser } from '@/lib/session';

import AdPhotosGallery from '../AdPhotosGallery';
import {
  Wrapper,
  InfoWrapper,
  Title,
  Description,
  City,
  ContactPhone,
  Price,
} from './AdCard.styles';

type AdCardProps = {
  ad: AdWithImages;
};

async function AdCard({ ad }: AdCardProps) {
  const {
    userId,
    title,
    price,
    city,
    description,
    contactPhone,
    images,
  } = ad;

  const currentUser = await getSessionUser();
  const isAllowedToDeletePhoto = currentUser?.userId === userId;

  const formattedPrice = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Number(price));

  const formattedPhone = formatCZPhone(contactPhone);

  return (
    <Wrapper>
      <AdPhotosGallery
        photos={images}
        allowDeletePhoto={isAllowedToDeletePhoto}
      />

      <InfoWrapper>
        <Title>{title}</Title>
        <Description>{description}</Description>
        <City>
          <span>City:</span> {city}
        </City>
        <ContactPhone>
          <span>Contact:</span>
          {currentUser ? formattedPhone : 'Log in to see the contact'}
        </ContactPhone>

        <Price>
          <span>Price: </span>
          {formattedPrice}
        </Price>
      </InfoWrapper>
    </Wrapper>
  );
}

export default AdCard;