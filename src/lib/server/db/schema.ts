import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import type { Site } from '../../modeler/types';

// One row per site. `data` holds the full Site object with its plans (source of truth);
// `name` is copied out only so the sites list doesn't need to read the JSON.
export const sites = pgTable('sites', {
	id: uuid('id').primaryKey(),
	slug: text('slug').notNull().unique(), // current URL slug, see modeler/slug.ts
	name: text('name').notNull().default(''),
	data: jsonb('data').$type<Site>().notNull(),
	duplicatedFrom: uuid('duplicated_from'),
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
