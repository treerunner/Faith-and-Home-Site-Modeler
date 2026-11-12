import { customType, pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import type { Site } from '../../modeler/types';

// PostGIS geography, written with ST_ functions and not read back by the app (the Site JSON
// is the source of truth); it exists for spatial queries across sites.
const geography = (subtype: 'Point' | 'Geometry') =>
	customType<{ data: string; driverData: string }>({ dataType: () => `geography(${subtype}, 4326)` });

// One row per site. `data` holds the full Site object with its plans (source of truth);
// `name` is copied out only so the sites list doesn't need to read the JSON.
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
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
