'use client';
import * as React from 'react';
import type { AdWithoutUserId } from '@/types/db-types';
import Image from 'next/image';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';
import Link from 'next/link';
import { motion } from 'motion/react';

type AdCardProps = {
  ad: AdWithoutUserId;
};

const imageVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.05 },
};

function AdSummaryCard({ ad }: AdCardProps) {
  const {
    id,
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

  const image = images?.[0]?.url ?? '/globe.svg';

  const formattedPrice = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Number(price));

  return (
    <Link
      href={`/ad/${id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Wrapper initial="rest" whileHover="hover">
        <PriceTag>{formattedPrice}</PriceTag>
        <ImageWrapper>
          <CoverImage
            alt={title}
            src={image}
            fill
            sizes="(max-width: 600px) 100vw, 600px"
            variants={imageVariants}
            transition={{
              type: 'spring',
              stiffness: 140,
              damping: 50,
              restDelta: 0.01,
            }}
          />
        </ImageWrapper>
        <InfoWrapper>
          <Title>{title}</Title>
          <Description>{description}</Description>
          <City>
            City: <span>{city}</span>
          </City>
        </InfoWrapper>
      </Wrapper>
    </Link>
  );
}

const Wrapper = styled(motion.article)`
  height: 420px;
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
`;

const ImageWrapper = styled.div`
  height: 100%;
  position: relative;
  margin: -16px;
  //truncate image when scaling
  overflow: hidden;
  border-radius: 16px 16px 0px 0px;
`;

const CoverImage = styled(motion(Image))`
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 16px 16px 0px 0px;
`;

const PriceTag = styled.div`
  position: absolute;
  z-index: 1;
  top: 8px;
  right: -8px;
  background-color: var(--color-pricetag-background);
  border: 1px solid var(--color-border);
  border-top-left-radius: 1rem;
  border-bottom-left-radius: 1rem;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
  padding-right: 8px;
  padding-left: 16px;
  font-size: 1rem;
  font-weight: ${WEIGHTS.medium};
  line-height: 2;
  box-shadow: var(--shadow-card);
`;

const InfoWrapper = styled.div`
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

export default AdSummaryCard;
