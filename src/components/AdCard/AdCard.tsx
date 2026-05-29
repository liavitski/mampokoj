import * as React from 'react';
import { AdWithImages } from '@/server/db/schema';

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
  return (
    <div>
      <h3>{title}</h3>
      <img src={images[0].url} />

    </div>
  );
}

export default AdCard;
