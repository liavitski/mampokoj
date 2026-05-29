import * as React from 'react';
import AdCard from '../AdCard';
import { getAdsWithImages } from '@/server/queries/select';


async function AdGrid() {
  const adsWithImages = await getAdsWithImages();

  return (
    <div>
      {adsWithImages.map((adWithImage) => (
        <AdCard key={adWithImage.id} ad={adWithImage} />
      ))}
    </div>
  );
}

export default AdGrid;
