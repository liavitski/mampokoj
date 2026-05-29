import type { InferSelectModel } from 'drizzle-orm';
import { ads, images } from '@/server/db/schema';

export type Ad = InferSelectModel<typeof ads>;
export type Image = InferSelectModel<typeof images>;
export type AdWithImages = Ad & {
  images: Image[];
};
