import { pgTableCreator, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

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
    /**
     * When a signed-in visitor flagged this listing, or null if nobody has.
     *
     * First report wins, enforced in the report write's own predicate rather
     * than by a read: the update only matches `reportedAt IS NULL`, so a second
     * report updates no rows and two concurrent reports resolve without either
     * of them failing. No transaction and no Redis are involved -- the same
     * reasoning that put the ad limit on the slot index.
     *
     * Deliberately absent from `PublicAd`. This is moderation state, not a
     * property of the room, and a public flag would let anyone probe which ad
     * ids have been reported.
     *
     * Note that reporting an ad also moves `updatedAt`, because this is a
     * single `db.update` and drizzle applies `$onUpdate` to every one. Accepted
     * deliberately: preserving the old value would need raw SQL, which would
     * cost the compiled-SQL assertions the authorization tests depend on.
     */
    reportedAt: d.timestamp({ withTimezone: true }),
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
    /**
     * Partial, and not unique: it indexes the moderation queue
     * (`WHERE "reportedAt" IS NOT NULL`) rather than the table, which matters
     * because this column is null on every ad nobody has reported -- which is
     * every ad in practice. Two reported ads must both appear in the queue, so
     * uniqueness would be wrong.
     */
    index('mampokoj_ads_reported_idx')
      .on(t.reportedAt)
      .where(sql`${t.reportedAt} IS NOT NULL`),
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
