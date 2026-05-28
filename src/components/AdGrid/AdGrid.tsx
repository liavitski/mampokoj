import * as React from 'react';
import { getAds } from '@/server/queries/select';
import AdCard from '../AdCard';

async function AdGrid() {
  const ads = await getAds();

  return (
    <div>
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

export default AdGrid;
