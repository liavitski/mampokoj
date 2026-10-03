import * as React from 'react';

import { formatCZPhone } from '@/utils/utils';

import type { AdWithoutUserId } from '@/types/db-types';

import { getSessionUser } from '@/lib/session';

import AdPhotosGallery from '../AdPhotosGallery';
import BlurredPhone from '../BlurredPhone';
import ReportButton from '../ReportButton';
import {
  Wrapper,
  InfoWrapper,
  Title,
  Description,
  City,
  ContactPhone,
  Price,
  ReportRow,
} from './AdCardCompact.styles';

type AdCardProps = {
  ad: AdWithoutUserId;
};

async function AdCardCompact({ ad }: AdCardProps) {
  const {
    title,
    price,
    city,
    description,
    contactPhone,
    images,
  } = ad;

  const currentUser = await getSessionUser();

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
          {/*
            Signed out: the digits are never rendered, so there is nothing to
            blur. Signed in: blurred until clicked. See BlurredPhone for why the
            blur is a courtesy and not a gate -- the number is in the HTML.
          */}
          {currentUser ? (
            <BlurredPhone phone={formattedPhone} />
          ) : (
            'Log in to see the contact'
          )}
        </ContactPhone>

        <Price>
          <span>Price: </span>
          {formattedPrice}
        </Price>

        {/*
          Signed in only, for the same reason the phone number is: the session
          is already read here, and an anonymous visitor gets a control that
          could only ever be refused. Deliberately inside InfoWrapper, so the
          modal's box owns the surface as it does for the rest of the card.

          This renders in both copies of this card -- /ad/[adId] and the
          intercepting modal -- which is consistent rather than duplicated: both
          are the same ad, shown two ways.
        */}
        {currentUser && (
          <ReportRow>
            <ReportButton adId={ad.id} />
          </ReportRow>
        )}
      </InfoWrapper>
    </Wrapper>
  );
}

export default AdCardCompact;