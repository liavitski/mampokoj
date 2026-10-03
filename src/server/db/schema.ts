import { pgTableCreator, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const createTable = pgTableCreator(
  (name) => `mampokoj_${name}`
);

export const ads = createTable(
  'ads',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d.varchar({ length: 255 }).notNull(),
    /**
     * Which of the user's ad slots this row occupies.
     *
     * The pair (userId, slot) is unique, so Postgres -- not a
     * count read under a lock -- is what enforces MAX_ADS_PER_USER:
     * an insert only succeeds into a slot nobody holds, and a user
     * at the limit holds every one. createAd tries the slots in
     * order and treats a conflict as "this one is taken", so the
     * limit holds even when Redis is unreachable.
     */
    slot: d.smallint().notNull().default(0),
    title: d.varchar({ length: 60 }).notNull(),
    price: d.numeric({ precision: 10, scale: 2 }).notNull(),
    city: d.varchar({ length: 80 }).notNull(),
    region: d.varchar({ length: 128 }).notNull(),
    availableFrom: d.timestamp({ withTimezone: true }).notNull(),
    description: d.text().notNull(),
    contactPhone: d.varchar({ length: 16 }).notNull(),
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
    uniqueIndex('mampokoj_ads_user_slot_unique').on(t.userId, t.slot),
    index('mampokoj_ads_region_created_id_idx').on(
      t.region,
      t.createdAt,
      t.id
    ),
    index('mampokoj_ads_created_id_idx').on(t.createdAt, t.id),
  ]
);

export const images = createTable(
  'images',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    adId: d
      .uuid()
      .notNull()
      .references(() => ads.id, { onDelete: 'cascade' }),
    url: d.varchar({ length: 512 }).notNull(),
    fileKey: d.varchar({ length: 255 }).notNull().unique(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    index('mampokoj_images_ad_idx').on(t.adId),
    index('mampokoj_images_filekey_idx').on(t.fileKey),
  ]
);

export const adsRelations = relations(ads, ({ many }) => ({
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  ad: one(ads, { fields: [images.adId], references: [ads.id] }),
}));
