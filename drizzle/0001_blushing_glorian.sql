ALTER TABLE "sites" ADD COLUMN "short_id" text;--> statement-breakpoint
-- Backfill existing rows from their uuid; new rows get ids from newShortId()
UPDATE "sites" SET "short_id" = substr(md5("id"::text), 1, 6) WHERE "short_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "short_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_short_id_unique" UNIQUE("short_id");
