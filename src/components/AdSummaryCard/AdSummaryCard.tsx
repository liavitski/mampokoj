'use client';
import * as React from 'react';
import type { PublicAd } from '@/types/db-types';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';
import Link from 'next/link';
import Image from 'next/image';

import { formatPriceCZK } from '@/utils/utils';

type AdCardProps = {
  ad: PublicAd;
};

function AdSummaryCard({ ad }: AdCardProps) {
  const {
    id,
    title,
    price,
    city,
    description,
    createdAt,
    images,
  } = ad;

  const image = images?.[0]?.url ?? '/globe.svg';

  const formattedPrice = formatPriceCZK(price);

  const formattedCreatedAt = new Date(createdAt).toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );

  return (
    <Link
      href={`/ad/${id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Wrapper>
        <PriceTag>{formattedPrice}</PriceTag>
        <ImageWrapper>
          <CoverImage
            /*
             * Empty alt, deliberately, and not an oversight.
             *
             * WCAG 1.1.1 asks for a description of what the image *shows*. There
             * is none to give: `mampokoj_images` stores only `url` and `fileKey`,
             * so no seller ever authored alt text and `alt={title}` described the
             * picture in exactly the words printed beside it. A screen-reader user
             * heard the title twice and learned nothing about the photo.
             *
             * It also has to be empty rather than conditional, because `image`
             * falls back to the decorative `/globe.svg` placeholder when the ad
             * has no photos. Any alt naming the ad would announce a stock globe as
             * if it were the listing's subject matter.
             *
             * The image sits inside the <Link>, so its alt also feeds the link's
             * accessible name -- which the card's own text already supplies.
             */
            alt=""
            src={image}
            fill
            sizes="(max-width: 600px) 100vw, 600px"
          />
        </ImageWrapper>
        <InfoWrapper>
          <Title>{title}</Title>
          <Description>{description}</Description>
          <City>
            <span>City:</span> {city}
          </City>
          <Created>
            <span>Created:</span> {formattedCreatedAt}
          </Created>
        </InfoWrapper>
      </Wrapper>
    </Link>
  );
}

/**
 * The card, and where the hover zoom is triggered.
 *
 * The scale was `motion`'s job: `variants` on the image plus `whileHover` on this
 * element, a spring from scale 1 to 1.05. It is a CSS transition here instead --
 * `motion` was removed from the project over it (HANDOFF.md §7), and the same
 * zoom is about four lines of CSS.
 *
 * **The trigger is the whole card, not the image.** `whileHover` was on this
 * element, so hovering the title or the price zoomed the photo, and the first
 * version of this rewrite put `&:hover` on `ImageWrapper` instead -- which made
 * the zoom work only over the top strip and went dead the moment the pointer
 * crossed onto the text. Nothing failed: the rule was valid, the tests passed,
 * and the effect was simply gone over most of the card. Caught by hovering a real
 * card in Chrome and reading `matches(':hover')` against the computed transform,
 * which is the only reason it was caught before shipping.
 *
 * The rule targets a bare `img` because `next/image` with `fill` writes its
 * geometry inline, and while this was a motion component that inline style also
 * carried `transform: none` -- which a stylesheet cannot override without
 * `!important`. Dropping motion drops that too, so the rule reaches the element on
 * its own.
 *
 * The reduced-motion guard is local rather than left to `globals.css`. That file
 * sets `transition-duration: 0s` for `article`, but `transition-duration` is not
 * inherited, so it never reached this `img` -- the guard has to sit next to the
 * transition it governs, or an animation added here silently outruns the
 * project's accessibility default.
 */
const Wrapper = styled.article`
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

  img {
    transition: transform 300ms cubic-bezier(0.1, 0.9, 0, 1);
  }

  &:hover img {
    transform: scale(1.05);
  }

  @media (prefers-reduced-motion: reduce) {
    img {
      transition: none;
    }
  }
`;

const ImageWrapper = styled.div`
  height: 100%;
  position: relative;
  margin: -16px;
  //truncate image when scaling
  overflow: hidden;
  border-radius: 16px 16px 0px 0px;
`;

const CoverImage = styled(Image)`
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
    'city city'
    'created created';
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 32px 1fr 28px 28px;
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
  align-self: flex-start;
`;

const City = styled.p`
  grid-area: city;
  font-size: 1rem;
  align-self: center;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

const Created = styled.p`
  grid-area: created;
  font-size: 1rem;
  align-self: center;

  span {
    font-weight: ${WEIGHTS.medium};
  }
`;

export default AdSummaryCard;
