import { boolean, customType, integer, pgTable, text, timestamp, unique, uuid, jsonb } from 'drizzle-orm/pg-core';
import type { Site } from '../../modeler/types';

// PostGIS geography, written with ST_ functions and not read back by the app (the Site JSON
// is the source of truth); it exists for spatial queries across sites.
const geography = (subtype: 'Point' | 'Geometry') =>
	customType<{ data: string; driverData: string }>({ dataType: () => `geography(${subtype}, 4326)` });

// One row per site. `data` holds the Site object (its settings and existing conditions; its
// plans are rows in `plans`); `name` is copied out so the sites list and the CMS needn't read
// the JSON. Sites saved before the plans table still carry `data.plans`, read when they have no
// plan rows.
export const sites = pgTable('sites', {
	id: uuid('id').primaryKey(),
	slug: text('slug').notNull().unique(), // current URL slug, see modeler/slug.ts
	name: text('name').notNull().default(''),
	data: jsonb('data').$type<Site>().notNull(),
	duplicatedFrom: uuid('duplicated_from'),
	// Address mode only, in lat/lng (converted from local meters at save). Parcel is Geometry
	// rather than Polygon because repairing a self-crossing drawn outline can yield a MultiPolygon.
	origin: geography('Point')('origin'),
	parcel: geography('Geometry')('parcel'),
	thumbnail: text('thumbnail'), // existing conditions in plan view, a small JPEG data URL captured on save
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per plan, so the CMS can list, rename and relate plans. `data` is the stored plan
// (its own pieces and its choices about the site's, see modeler/existing.ts): edited only in
// the modeler, never in the CMS.
export const plans = pgTable(
	'plans',
	{
		id: uuid('id').primaryKey(),
		siteId: uuid('site_id')
			.notNull()
			.references(() => sites.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		name: text('name').notNull().default(''),
		position: integer('position').notNull().default(0),
		oldSlugs: jsonb('old_slugs').$type<string[]>(),
		data: jsonb('data').$type<Record<string, unknown>>().notNull(),
		thumbnail: text('thumbnail'),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [unique('plans_site_slug').on(t.siteId, t.slug)],
);

// The pattern catalog, edited in the CMS. A pattern covers every combination of its listed
// building, site and development types (see patterns/catalog.ts); social answers pick a variant.
export const patterns = pgTable('patterns', {
	id: uuid('id').primaryKey().defaultRandom(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	summary: text('summary').notNull().default(''),
	placeholder: boolean('placeholder').notNull().default(true),
	sort: integer('sort').notNull().default(0),
	buildingTypes: jsonb('building_types').$type<string[]>().notNull().default([]),
	siteTypes: jsonb('site_types').$type<string[]>().notNull().default([]),
	developmentTypes: jsonb('development_types').$type<string[]>().notNull().default([]),
	// A modeled site shown as the pattern's example; no plan means its existing conditions
	exampleSiteId: uuid('example_site_id').references(() => sites.id, { onDelete: 'set null' }),
	examplePlanId: uuid('example_plan_id').references(() => plans.id, { onDelete: 'set null' }),
});

export const patternSections = pgTable('pattern_sections', {
	id: uuid('id').primaryKey().defaultRandom(),
	patternId: uuid('pattern_id')
		.notNull()
		.references(() => patterns.id, { onDelete: 'cascade' }),
	sort: integer('sort').notNull().default(0),
	heading: text('heading').notNull().default(''),
	body: text('body').notNull().default(''),
});

// A variant fits when every condition is answered and allowed; a null condition doesn't apply
export const patternVariants = pgTable('pattern_variants', {
	id: uuid('id').primaryKey().defaultRandom(),
	patternId: uuid('pattern_id')
		.notNull()
		.references(() => patterns.id, { onDelete: 'cascade' }),
	sort: integer('sort').notNull().default(0),
	key: text('key').notNull(),
	name: text('name').notNull(),
	summary: text('summary').notNull().default(''),
	whenSize: jsonb('when_size').$type<string[]>(),
	whenTenure: jsonb('when_tenure').$type<string[]>(),
	whenOwnership: jsonb('when_ownership').$type<string[]>(),
	whenPartnering: jsonb('when_partnering').$type<string[]>(),
	whenCapacity: jsonb('when_capacity').$type<string[]>(),
	whenChange: jsonb('when_change').$type<string[]>(),
	whenRole: jsonb('when_role').$type<string[]>(),
});

// Every slug a site has had, current and old, so renamed sites keep their links.
// The primary key stops two sites from ever claiming the same slug.
export const siteSlugs = pgTable('site_slugs', {
	slug: text('slug').primaryKey(),
	siteId: uuid('site_id')
		.notNull()
		.references(() => sites.id, { onDelete: 'cascade' }),
});

export type SiteRow = typeof sites.$inferSelect;
