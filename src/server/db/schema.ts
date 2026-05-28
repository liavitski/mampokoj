import { pgTableCreator, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export const createTable = pgTableCreator(
  (name) => `mampokoj_${name}`
);

export const ads = createTable(
  'ads',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d.varchar({ length: 256 }).notNull(),
    title: d.varchar({ length: 256 }).notNull(),
    price: d.numeric({ precision: 10, scale: 2 }).notNull(),
    city: d.varchar({ length: 128 }).notNull(),
    region: d.varchar({ length: 128 }).notNull(),
    availableFrom: d.timestamp({ withTimezone: true }).notNull(),
    description: d.text().notNull(),
    contactPhone: d.varchar({ length: 32 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [
    index('mampokoj_ads_user_idx').on(t.userId),
    index('mampokoj_ads_region_created_id_idx').on(
      t.region,
      t.createdAt,
      t.id
    ),
    index('mampokoj_ads_created_id_idx').on(t.createdAt, t.id),
  ]
);

export type Ad = InferSelectModel<typeof ads>;

export const images = createTable(
  'images',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d.varchar({ length: 256 }).notNull(),
    adId: d
      .uuid()
      .notNull()
      .references(() => ads.id, { onDelete: 'cascade' }),
    url: d.varchar({ length: 512 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index('mampokoj_images_ad_idx').on(t.adId)]
);

export const adsRelations = relations(ads, ({ many }) => ({
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  ad: one(ads, { fields: [images.adId], references: [ads.id] }),
}));

export type Image = InferSelectModel<typeof images>;
