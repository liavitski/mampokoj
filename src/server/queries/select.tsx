import { db } from '../db';

export async function getAds() {
  const first10Ads = await db.query.ads.findMany({ limit: 10 });

  return first10Ads;
}

export async function getAdsWithImages() {
  const adsWithImages = await db.query.ads.findMany({
    with: {
      images: true,
    },
    orderBy: (model, { desc }) => desc(model.createdAt),
    limit: 10,
  });

  return adsWithImages;
}
