ALTER TABLE "mampokoj_ads" ADD COLUMN "slot" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mampokoj_ads_user_slot_unique" ON "mampokoj_ads" USING btree ("userId","slot");