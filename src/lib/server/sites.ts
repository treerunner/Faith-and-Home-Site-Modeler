import { error } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { sites } from './db/schema';
import { normalizeSite, SiteFormatError } from '../modeler/serialize';
import type { Site } from '../modeler/types';

export interface SiteSummary {
	id: string;
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

export async function listSites(): Promise<SiteSummary[]> {
	return db
		.select({ id: sites.id, name: sites.name, duplicatedFrom: sites.duplicatedFrom, updatedAt: sites.updatedAt })
		.from(sites)
		.orderBy(desc(sites.updatedAt));
}

export async function getSite(id: string): Promise<Site> {
	const [row] = await db.select({ data: sites.data }).from(sites).where(eq(sites.id, id));
	if (!row) error(404, 'Site not found');
	return normalizeSite(row.data);
}

// Insert or update. The client generates Site.id, so the first save and later saves share one path.
export async function saveSite(id: string, body: unknown): Promise<Site> {
	const site = parseBody(body);
	if (site.id !== id) error(400, 'Site id does not match URL');
	await db
		.insert(sites)
		.values({ id, name: site.name, data: site })
		.onConflictDoUpdate({
			target: sites.id,
			set: { name: site.name, data: site, updatedAt: sql`now()` },
		});
	return site;
}

export async function deleteSite(id: string): Promise<void> {
	const deleted = await db.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id });
	if (deleted.length === 0) error(404, 'Site not found');
}

export async function duplicateSite(id: string): Promise<Site> {
	const source = await getSite(id);
	const copy: Site = { ...source, id: crypto.randomUUID(), name: `${source.name || 'Untitled'} copy` };
	await db.insert(sites).values({ id: copy.id, name: copy.name, data: copy, duplicatedFrom: id });
	return copy;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reject malformed ids before they reach Postgres, which would throw on the uuid cast.
export function siteId(id: string): string {
	if (!UUID.test(id)) error(404, 'Site not found');
	return id;
}
