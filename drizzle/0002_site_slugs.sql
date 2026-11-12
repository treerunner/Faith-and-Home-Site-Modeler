CREATE TABLE "site_slugs" (
	"slug" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_short_id_unique";--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "short_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill: a simple slugify of the name (the app's slugify also strips accents and
-- apostrophes), with reserved words and duplicates numbered from -2, oldest site first.
WITH base AS (
	SELECT id, created_at,
		coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'untitled') AS slug
	FROM "sites"
), numbered AS (
	SELECT id,
		slug,
		row_number() OVER (PARTITION BY slug ORDER BY created_at, id)
			+ CASE WHEN slug IN ('sites', 'new', 'view') THEN 1 ELSE 0 END AS n
	FROM base
)
UPDATE "sites" s
SET "slug" = CASE WHEN numbered.n = 1 THEN numbered.slug ELSE numbered.slug || '-' || numbered.n END
FROM numbered
WHERE s.id = numbered.id;--> statement-breakpoint
INSERT INTO "site_slugs" ("slug", "site_id") SELECT "slug", "id" FROM "sites";--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "site_slugs" ADD CONSTRAINT "site_slugs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_slug_unique" UNIQUE("slug");
