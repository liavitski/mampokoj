import { db } from '../db';

export async function getAds() {
  const first10Ads = await db.query.ads.findMany({ limit: 10 });

  return first10Ads;
}
