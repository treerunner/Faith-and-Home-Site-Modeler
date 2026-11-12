import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import type { Site } from '../../modeler/types';

// One row per site. `data` holds the full Site object (source of truth);
// `name` is copied out only so the sites list doesn't need to read the JSON.
export const sites = pgTable('sites', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull().default(''),
	data: jsonb('data').$type<Site>().notNull(),
	duplicatedFrom: uuid('duplicated_from'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SiteRow = typeof sites.$inferSelect;
