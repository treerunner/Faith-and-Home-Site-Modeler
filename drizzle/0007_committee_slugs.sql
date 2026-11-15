-- Committees get a URL slug (filled in for the ones that exist, by name, numbered if they
-- clash), earlier slugs for redirects, and an optional one-line description
ALTER TABLE "committees" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "old_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "committees" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "committees" c SET "slug" = s."slug"
FROM (
	SELECT "id", base || CASE WHEN row_number() OVER (PARTITION BY base ORDER BY "created_at") = 1 THEN '' ELSE '-' || row_number() OVER (PARTITION BY base ORDER BY "created_at") END AS "slug"
	FROM (SELECT "id", "created_at", coalesce(nullif(trim(both '-' from regexp_replace(lower(regexp_replace("name", '[''’]', '', 'g')), '[^a-z0-9]+', '-', 'g')), ''), 'committee') AS base FROM "committees") b
) s
WHERE c."id" = s."id";--> statement-breakpoint
ALTER TABLE "committees" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_slug_unique" UNIQUE("slug");
