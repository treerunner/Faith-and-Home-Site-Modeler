import { error, redirect } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { sites } from './db/schema';
import { normalizeSite, SiteFormatError } from '../modeler/serialize';
import { newShortId, parseShortId, siteSlug } from '../modeler/slug';
import { editUrl, viewUrl, type SiteRef } from '../modeler/api';
import type { Site } from '../modeler/types';

export interface SiteSummary {
	id: string;
	shortId: string;
	name: string;
	duplicatedFrom: string | null;
	updatedAt: Date;
}

function parseBody(body: unknown): Site {
	try {
		return normalizeSite(body);
	} catch (e) {
		if (e instanceof SiteFormatError) error(400, e.message);
		throw e;
	}
}

function isShortIdCollision(e: unknown): boolean {
	const pg = (e as { cause?: { code?: string; constraint_name?: string } })?.cause;
	return pg?.code === '23505' && pg.constraint_name === 'sites_short_id_unique';
}

// Runs an insert with a fresh short id, retrying if it collides with an existing one.
async function withNewShortId<T>(insert: (shortId: string) => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await insert(newShortId());
		} catch (e) {
			if (attempt < 4 && isShortIdCollision(e)) continue;
			throw e;
		}
	}
}

export async function listSites(): Promise<SiteSummary[]> {
	return db
		.select({
			id: sites.id,
			shortId: sites.shortId,
			name: sites.name,
			duplicatedFrom: sites.duplicatedFrom,
			updatedAt: sites.updatedAt,
		})
		.from(sites)
		.orderBy(desc(sites.updatedAt));
}

export async function getSite(id: string): Promise<Site> {
	const [row] = await db.select({ data: sites.data }).from(sites).where(eq(sites.id, id));
	if (!row) error(404, 'Site not found');
	return normalizeSite(row.data);
}

// Resolves a URL slug (`grace-church-7f3k9q`) or a bare uuid from older links.
export async function getSiteBySlug(slug: string): Promise<{ site: Site; shortId: string }> {
	const shortId = UUID.test(slug) ? null : parseShortId(slug);
	if (!shortId && !UUID.test(slug)) error(404, 'Site not found');
	const [row] = await db
		.select({ data: sites.data, shortId: sites.shortId })
		.from(sites)
		.where(shortId ? eq(sites.shortId, shortId) : eq(sites.id, slug));
	if (!row) error(404, 'Site not found');
	return { site: normalizeSite(row.data), shortId: row.shortId };
}

// Page load for /modeler/[slug] and /view. Redirects a stale or uuid-based URL to the current slug.
export async function loadSiteRoute(slug: string, readOnly: boolean): Promise<{ site: Site; shortId: string }> {
	const { site, shortId } = await getSiteBySlug(slug);
	if (slug !== siteSlug(site.name, shortId)) redirect(307, (readOnly ? viewUrl : editUrl)(site.name, shortId));
	return { site, shortId };
}

// Insert or update. The client generates Site.id, so the first save and later saves share one path.
// The short id is set once, on insert, and never changes.
export async function saveSite(id: string, body: unknown): Promise<SiteRef> {
	const site = parseBody(body);
	if (site.id !== id) error(400, 'Site id does not match URL');
	const [row] = await withNewShortId((shortId) =>
		db
			.insert(sites)
			.values({ id, shortId, name: site.name, data: site })
			.onConflictDoUpdate({
				target: sites.id,
				set: { name: site.name, data: site, updatedAt: sql`now()` },
			})
			.returning({ shortId: sites.shortId }),
	);
	return { id, shortId: row.shortId, name: site.name };
}

export async function deleteSite(id: string): Promise<void> {
	const deleted = await db.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id });
	if (deleted.length === 0) error(404, 'Site not found');
}

export async function duplicateSite(id: string): Promise<SiteRef> {
	const source = await getSite(id);
	const copy: Site = { ...source, id: crypto.randomUUID(), name: `${source.name || 'Untitled'} copy` };
	const shortId = await withNewShortId(async (shortId) => {
		await db.insert(sites).values({ id: copy.id, shortId, name: copy.name, data: copy, duplicatedFrom: id });
		return shortId;
	});
	return { id: copy.id, shortId, name: copy.name };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reject malformed ids before they reach Postgres, which would throw on the uuid cast.
export function siteId(id: string): string {
	if (!UUID.test(id)) error(404, 'Site not found');
	return id;
}
