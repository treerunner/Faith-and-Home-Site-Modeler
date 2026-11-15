import { sql } from 'drizzle-orm';
import { boolean, customType, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, jsonb } from 'drizzle-orm/pg-core';
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
	// The committee that owns it. Nullable in the database so older app versions can still save
	// during a rollout; the app always sets it.
	committeeId: uuid('committee_id').references(() => committees.id, { onDelete: 'cascade' }),
	visibility: text('visibility').$type<'public' | 'members'>().notNull().default('public'), // who can open the view link
	version: integer('version').notNull().default(0), // bumped on each save; a save made from an older version is refused
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Accounts and committees ──────────────────────────────────────────────────
// People sign in by email link (no passwords). Committees own sites; members edit them, leads
// also manage membership. The Faith & Home team committee (is_team) can do anything anywhere.

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(), // lowercased
	name: text('name').notNull().default(''),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const committees = pgTable(
	'committees',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(), // URL: /committees/<slug>, from the name
		oldSlugs: jsonb('old_slugs').$type<string[]>().notNull().default([]), // earlier names' slugs, which redirect
		description: text('description').notNull().default(''), // one optional line, e.g. "Grace UMC, Allentown: property committee"
		isTeam: boolean('is_team').notNull().default(false),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [uniqueIndex('committees_one_team').on(t.isTeam).where(sql`${t.isTeam}`)],
);

export const memberships = pgTable(
	'memberships',
	{
		committeeId: uuid('committee_id')
			.notNull()
			.references(() => committees.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role').$type<'lead' | 'member'>().notNull().default('member'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.committeeId, t.userId] }), index('memberships_user').on(t.userId)],
);

// Tokens (invitations, sign-in links, sessions) are stored only as SHA-256 hashes
export const invitations = pgTable('invitations', {
	id: uuid('id').primaryKey().defaultRandom(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id, { onDelete: 'cascade' }),
	email: text('email').notNull(),
	role: text('role').$type<'lead' | 'member'>().notNull().default('member'),
	tokenHash: text('token_hash').notNull().unique(),
	invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	acceptedAt: timestamp('accepted_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loginTokens = pgTable('login_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	email: text('email').notNull(),
	next: text('next').notNull().default('/modeler/sites'),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	usedAt: timestamp('used_at', { withTimezone: true }),
});

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(), // hash of the cookie's token
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	},
	(t) => [index('sessions_user').on(t.userId)],
);

// App-wide switches the team sets in /admin (allow_new_committees)
export const settings = pgTable('settings', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
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
