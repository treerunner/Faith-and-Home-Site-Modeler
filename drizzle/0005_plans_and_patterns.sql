CREATE TABLE "pattern_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"heading" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"when_size" jsonb,
	"when_tenure" jsonb,
	"when_ownership" jsonb,
	"when_partnering" jsonb,
	"when_capacity" jsonb,
	"when_change" jsonb,
	"when_role" jsonb
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"placeholder" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"building_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"site_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"development_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"example_site_id" uuid,
	"example_plan_id" uuid,
	CONSTRAINT "patterns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"old_slugs" jsonb,
	"data" jsonb NOT NULL,
	"thumbnail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_site_slug" UNIQUE("site_id","slug")
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "thumbnail" text;--> statement-breakpoint
ALTER TABLE "pattern_sections" ADD CONSTRAINT "pattern_sections_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_variants" ADD CONSTRAINT "pattern_variants_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_example_site_id_sites_id_fk" FOREIGN KEY ("example_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_example_plan_id_plans_id_fk" FOREIGN KEY ("example_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Plans move to their own rows. data.plans stays on the site row until its next save, so code
-- that still reads it keeps working.
INSERT INTO "plans" ("id", "site_id", "slug", "name", "position", "old_slugs", "data")
SELECT (p.value->>'id')::uuid, s."id", coalesce(p.value->>'slug', 'plan-' || p.ordinality), coalesce(p.value->>'name', ''), (p.ordinality - 1)::int, p.value->'oldSlugs', p.value
FROM "sites" s, jsonb_array_elements(CASE WHEN jsonb_typeof(s."data"->'plans') = 'array' THEN s."data"->'plans' ELSE '[]'::jsonb END) WITH ORDINALITY p
WHERE (p.value->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--> statement-breakpoint
-- The placeholder catalog (patterns/seed.ts), for the team to replace in the CMS
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('urban-box-adaptive-reuse', 'Urban box, adaptive reuse', 'A single church building in the city, with part of it reused for housing or community space.', true, 0, '["box"]'::jsonb, '["urban"]'::jsonb, '["reuse"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'urban-box-adaptive-reuse';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Urban sites with one simple building, where part of the building can take on a new use.' FROM "patterns" WHERE "slug" = 'urban-box-adaptive-reuse';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'urban-box-adaptive-reuse';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('urban-box-plus-adaptive-reuse', 'Urban box-plus, adaptive reuse', 'A church that grew by additions, with a wing or upper floors reused for housing.', true, 1, '["box_plus"]'::jsonb, '["urban"]'::jsonb, '["reuse","reuse_new"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'urban-box-plus-adaptive-reuse';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Urban sites where a sanctuary and its additions form one building, and a wing can be converted.' FROM "patterns" WHERE "slug" = 'urban-box-plus-adaptive-reuse';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'urban-box-plus-adaptive-reuse';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 0, 'with-partner', 'With a housing partner', 'Placeholder. A development or housing partner leads design, financing and management.', NULL, NULL, NULL, '["open"]'::jsonb, NULL, NULL, NULL FROM "patterns" WHERE "slug" = 'urban-box-plus-adaptive-reuse';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 1, 'congregation-led', 'Congregation-led', 'Placeholder. The congregation leads, with its own staff stewarding the project.', NULL, NULL, NULL, NULL, '["some_staff","staffed"]'::jsonb, NULL, NULL FROM "patterns" WHERE "slug" = 'urban-box-plus-adaptive-reuse';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('suburban-new-development-on-the-lot', 'Suburban box and box-plus, new development on the lot', 'New housing built on part of a larger suburban lot, often on surplus parking.', true, 2, '["box","box_plus"]'::jsonb, '["suburban"]'::jsonb, '["new","reuse_new"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'suburban-new-development-on-the-lot';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Suburban sites with room to build: large lots and underused parking.' FROM "patterns" WHERE "slug" = 'suburban-new-development-on-the-lot';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'suburban-new-development-on-the-lot';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 0, 'with-partner', 'With a housing partner', 'Placeholder. A development or housing partner leads design, financing and management.', NULL, NULL, NULL, '["open"]'::jsonb, NULL, NULL, NULL FROM "patterns" WHERE "slug" = 'suburban-new-development-on-the-lot';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 1, 'congregation-led', 'Congregation-led', 'Placeholder. The congregation leads, with its own staff stewarding the project.', NULL, NULL, NULL, NULL, '["some_staff","staffed"]'::jsonb, NULL, NULL FROM "patterns" WHERE "slug" = 'suburban-new-development-on-the-lot';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('rural-cluster-cottage-housing', 'Rural cluster, cottage housing', 'A small group of cottages added near a rural church and its outbuildings.', true, 3, '["cluster"]'::jsonb, '["rural"]'::jsonb, '["new"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'rural-cluster-cottage-housing';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Rural sites with several buildings and open land around them.' FROM "patterns" WHERE "slug" = 'rural-cluster-cottage-housing';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'rural-cluster-cottage-housing';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('object-church-hall-reuse', 'Object church, reuse of a parish hall', 'A mid-century object church kept as it is, with its hall or school reused.', true, 4, '["object"]'::jsonb, '["urban","suburban"]'::jsonb, '["reuse"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'object-church-hall-reuse';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Sites with a distinctive object-in-space sanctuary that the congregation wants to keep intact.' FROM "patterns" WHERE "slug" = 'object-church-hall-reuse';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'object-church-hall-reuse';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('urban-cluster-partner-campus', 'Urban cluster, campus of partners', 'Several buildings on one block shared with housing and service partners.', true, 5, '["cluster"]'::jsonb, '["urban"]'::jsonb, '["reuse","new","reuse_new"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'urban-cluster-partner-campus';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Urban campuses with a school, rectory or hall alongside the church.' FROM "patterns" WHERE "slug" = 'urban-cluster-partner-campus';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'urban-cluster-partner-campus';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('stewarding-what-you-have', 'Stewarding what you have', 'Keeping the property as it is and making the most of it for the congregation and the neighborhood.', true, 6, '["box","box_plus","object","cluster"]'::jsonb, '["urban","suburban","rural"]'::jsonb, '["existing"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'stewarding-what-you-have';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Any property, when the plan is to keep the buildings as they are.' FROM "patterns" WHERE "slug" = 'stewarding-what-you-have';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'stewarding-what-you-have';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 0, 'leased', 'Leased space', 'Placeholder. Change happens through partnerships rather than property.', NULL, NULL, '["leased"]'::jsonb, NULL, NULL, NULL, NULL FROM "patterns" WHERE "slug" = 'stewarding-what-you-have';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 1, 'gathering', 'Gathering place', 'Placeholder. Opening the building to the neighborhood for events and groups.', NULL, NULL, NULL, NULL, NULL, NULL, '["gathering"]'::jsonb FROM "patterns" WHERE "slug" = 'stewarding-what-you-have';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 2, 'service', 'Service provider', 'Placeholder. Hosting services like food, shelter or daycare in existing space.', NULL, NULL, NULL, NULL, NULL, NULL, '["service"]'::jsonb FROM "patterns" WHERE "slug" = 'stewarding-what-you-have';--> statement-breakpoint
INSERT INTO "patterns" ("slug", "name", "summary", "placeholder", "sort", "building_types", "site_types", "development_types") VALUES ('right-sizing-the-property', 'Right-sizing the property', 'Consolidating onto less of the property, or selling land or buildings, to fit the congregation today.', true, 7, '["box","box_plus","object","cluster"]'::jsonb, '["urban","suburban","rural"]'::jsonb, '["downsize_sell"]'::jsonb);--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 0, 'What it is', 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' FROM "patterns" WHERE "slug" = 'right-sizing-the-property';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 1, 'Where it fits', 'Any property, when the plan is to downsize or sell.' FROM "patterns" WHERE "slug" = 'right-sizing-the-property';--> statement-breakpoint
INSERT INTO "pattern_sections" ("pattern_id", "sort", "heading", "body") SELECT "id", 2, 'Stories', 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' FROM "patterns" WHERE "slug" = 'right-sizing-the-property';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 0, 'consolidate', 'Consolidate and stay', 'Placeholder. Moving into fewer buildings and letting the rest go.', NULL, NULL, NULL, NULL, NULL, '["preserve","adapt"]'::jsonb, NULL FROM "patterns" WHERE "slug" = 'right-sizing-the-property';--> statement-breakpoint
INSERT INTO "pattern_variants" ("pattern_id", "sort", "key", "name", "summary", "when_size", "when_tenure", "when_ownership", "when_partnering", "when_capacity", "when_change", "when_role") SELECT "id", 1, 'sell', 'Sell to fund the mission', 'Placeholder. Selling land or buildings to fund ministry or relocation.', NULL, NULL, NULL, NULL, NULL, '["transform"]'::jsonb, NULL FROM "patterns" WHERE "slug" = 'right-sizing-the-property';
