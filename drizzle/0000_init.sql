CREATE TABLE "mampokoj_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar(255) NOT NULL,
	"title" varchar(60) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"city" varchar(80) NOT NULL,
	"region" varchar(128) NOT NULL,
	"availableFrom" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"contactPhone" varchar(16) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mampokoj_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adId" uuid NOT NULL,
	"url" varchar(512) NOT NULL,
	"fileKey" varchar(255) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "mampokoj_images_fileKey_unique" UNIQUE("fileKey")
);
--> statement-breakpoint
ALTER TABLE "mampokoj_images" ADD CONSTRAINT "mampokoj_images_adId_mampokoj_ads_id_fk" FOREIGN KEY ("adId") REFERENCES "public"."mampokoj_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mampokoj_ads_user_idx" ON "mampokoj_ads" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mampokoj_ads_region_created_id_idx" ON "mampokoj_ads" USING btree ("region","createdAt","id");--> statement-breakpoint
CREATE INDEX "mampokoj_ads_created_id_idx" ON "mampokoj_ads" USING btree ("createdAt","id");--> statement-breakpoint
CREATE INDEX "mampokoj_images_ad_idx" ON "mampokoj_images" USING btree ("adId");--> statement-breakpoint
CREATE INDEX "mampokoj_images_filekey_idx" ON "mampokoj_images" USING btree ("fileKey");