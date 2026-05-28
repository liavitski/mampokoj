import * as React from 'react';
import { Ad } from '@/server/db/schema';

type AdCardProps = {
  ad: Ad;
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
  } = ad;
  return <div>{title}</div>;
}

export default AdCard;
