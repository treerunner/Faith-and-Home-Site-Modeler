import { error, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, like, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from './db';
import { plans, sites, siteSlugs } from './db/schema';
import { rowsFromSite, siteFromRows, type PlanRow } from './site-rows';
import { normalizeSite, SiteFormatError } from '../modeler/serialize';
import { storedSite } from '../modeler/existing';
import { developmentType } from '../modeler/metrics';
import type { DevelopmentType } from '../modeler/types';
import { findPlanBySlug, pickSlug, RESERVED_SITE_SLUGS, slugify } from '../modeler/slug';
import { planUrl, type SiteRef } from '../modeler/api';
import type { Site } from '../modeler/types';
import { siteGeography } from './geography';

export interface SiteSummary {
	id: string;
	slug: string;
	name: string;
	duplicatedFrom: string | null;
	updatedAt: Date;
	plans: { name: string; slug: string; developmentType: DevelopmentType | null }[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const planColumns = { siteId: plans.siteId, id: plans.id, slug: plans.slug, name: plans.name, position: plans.position, oldSlugs: plans.oldSlugs, data: plans.data };

async function planRowsFor(siteIds: string[]): Promise<Map<string, PlanRow[]>> {
	const out = new Map<string, PlanRow[]>();
	if (!siteIds.length) return out;
	const rows = await db.select(planColumns).from(plans).where(inArray(plans.siteId, siteIds)).orderBy(asc(plans.position));
	for (const { siteId, ...row } of rows) out.set(siteId, [...(out.get(siteId) ?? []), row]);
	return out;
}

// A site from its row and its plan rows
async function readSite(id: string, data: unknown): Promise<Site> {
	const rows = (await planRowsFor([id])).get(id) ?? [];
	return normalizeSite(siteFromRows(data as Record<string, unknown>, rows));
}

// Writes a site's row data and plan rows: plans it no longer has are deleted
async function writePlans(tx: Tx, siteId: string, planRows: PlanRow[], thumbnail?: { planId: string; image: string }) {
	const ids = planRows.map((p) => p.id);
	await tx.delete(plans).where(ids.length ? and(eq(plans.siteId, siteId), notInArray(plans.id, ids)) : eq(plans.siteId, siteId));
	// Slugs are unique per site: park them while plans swap names, then write the real ones
	if (planRows.length) await tx.update(plans).set({ slug: sql`${plans.id}::text` }).where(eq(plans.siteId, siteId));
	for (const p of planRows) {
		const values = { ...p, siteId, updatedAt: sql`now()`, ...(thumbnail?.planId === p.id ? { thumbnail: thumbnail.image } : {}) };
		await tx.insert(plans).values(values).onConflictDoUpdate({ target: plans.id, set: values });
	}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBody(body: unknown): Site {
	try {
		return normalizeSite(body);
	} catch (e) {
		if (e instanceof SiteFormatError) error(400, e.message);
		throw e;
	}
}

// Gives the site a slug for its current name, unless its slug already matches.
// Slugs other sites have ever used are taken; this site's own old slugs can be reused.
async function claimSlug(tx: Tx, siteId: string, name: string, current?: string): Promise<string> {
	const base = slugify(name);
	const rows = await tx
		.select({ slug: siteSlugs.slug })
		.from(siteSlugs)
		.where(and(ne(siteSlugs.siteId, siteId), or(eq(siteSlugs.slug, base), like(siteSlugs.slug, `${base}-%`))));
	const slug = pickSlug(name, new Set(rows.map((r) => r.slug)), RESERVED_SITE_SLUGS, current);
	if (slug !== current) {
		await tx.insert(siteSlugs).values({ slug, siteId }).onConflictDoNothing();
		await tx.update(sites).set({ slug }).where(eq(sites.id, siteId));
	}
	return slug;
}

export async function listSites(): Promise<SiteSummary[]> {
	const rows = await db
		.select({
			id: sites.id,
			slug: sites.slug,
			name: sites.name,
			duplicatedFrom: sites.duplicatedFrom,
			updatedAt: sites.updatedAt,
			data: sites.data,
		})
		.from(sites)
		.orderBy(desc(sites.updatedAt));
	const planRows = await planRowsFor(rows.map((r) => r.id));
	return rows.map(({ data, ...row }) => ({
		...row,
		plans: normalizeSite(siteFromRows(data as unknown as Record<string, unknown>, planRows.get(row.id) ?? [])).plans.map((p) => ({
			name: p.name,
			slug: p.slug,
			developmentType: developmentType(p),
		})),
	}));
}

export async function getSite(id: string): Promise<Site> {
	const [row] = await db.select({ data: sites.data }).from(sites).where(eq(sites.id, id));
	if (!row) error(404, 'Site not found');
	return readSite(id, row.data);
}

// Resolves a current or old site slug, or a bare uuid from links made before slugs.
async function getSiteBySlug(slug: string): Promise<{ site: Site; slug: string }> {
	const [row] = UUID.test(slug)
		? await db.select({ id: sites.id, data: sites.data, slug: sites.slug }).from(sites).where(eq(sites.id, slug))
		: await db
				.select({ id: sites.id, data: sites.data, slug: sites.slug })
				.from(siteSlugs)
				.innerJoin(sites, eq(sites.id, siteSlugs.siteId))
				.where(eq(siteSlugs.slug, slug.toLowerCase()));
	if (!row) error(404, 'Site not found');
	return { site: await readSite(row.id, row.data), slug: row.slug };
}

// Page load for /modeler/<site>[/<plan>][/view]. No plan is the site view (existing
// conditions); an unknown plan goes there too. Old site or plan slugs redirect to the current ones.
export async function loadPlanRoute(
	siteParam: string,
	planParam: string | undefined,
	readOnly: boolean,
): Promise<{ site: Site; siteSlug: string; planId: string }> {
	const { site, slug } = await getSiteBySlug(siteParam);
	const plan = (planParam && findPlanBySlug(site.plans, planParam)) || site.existing;
	if (siteParam !== slug || (planParam ?? '') !== plan.slug) redirect(307, planUrl(slug, plan.slug, readOnly));
	return { site, siteSlug: slug, planId: plan.id };
}

// What's on screen at save, as a small image: a plan's id, or null for existing conditions
function parseThumbnail(body: unknown): { planId: string | null; image: string } | undefined {
	const t = (body as { thumbnail?: { planId?: unknown; image?: unknown } } | null)?.thumbnail;
	if (!t || typeof t.image !== 'string' || !t.image.startsWith('data:image/') || t.image.length > 300_000) return undefined;
	return { planId: typeof t.planId === 'string' ? t.planId : null, image: t.image };
}

// Insert or update. The client generates Site.id, so the first save and later saves share one path.
// The site row holds its settings and existing conditions; each plan is a row of its own.
export async function saveSite(id: string, body: unknown): Promise<SiteRef> {
	const site = parseBody(body);
	if (site.id !== id) error(400, 'Site id does not match URL');
	const thumbnail = parseThumbnail(body);
	const { data, plans: planRows } = rowsFromSite(storedSite(site));
	const siteThumbnail = thumbnail && !thumbnail.planId ? { thumbnail: thumbnail.image } : {};
	return db.transaction(async (tx) => {
		const [existing] = await tx.select({ slug: sites.slug }).from(sites).where(eq(sites.id, id));
		const geo = siteGeography(site);
		if (existing) {
			await tx
				.update(sites)
				.set({ name: site.name, data: data as Site, ...geo, ...siteThumbnail, updatedAt: sql`now()` })
				.where(eq(sites.id, id));
		} else {
			// Placeholder until claimSlug sets the real one: the column is unique and not null
			await tx.insert(sites).values({ id, slug: id, name: site.name, data: data as Site, ...geo, ...siteThumbnail });
		}
		await writePlans(tx, id, planRows, thumbnail?.planId ? { planId: thumbnail.planId, image: thumbnail.image } : undefined);
		const slug = await claimSlug(tx, id, site.name, existing?.slug);
		return { id, slug, name: site.name };
	});
}

export async function deleteSite(id: string): Promise<void> {
	const deleted = await db.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id });
	if (deleted.length === 0) error(404, 'Site not found');
}

export async function duplicateSite(id: string): Promise<SiteRef> {
	const source = await getSite(id);
	// Plans get new ids: a plan row belongs to one site
	const copy: Site = { ...source, id: crypto.randomUUID(), name: `${source.name || 'Untitled'} copy`, plans: source.plans.map((p) => ({ ...p, id: crypto.randomUUID() })) };
	const { data, plans: planRows } = rowsFromSite(storedSite(copy));
	return db.transaction(async (tx) => {
		await tx.insert(sites).values({ id: copy.id, slug: copy.id, name: copy.name, data: data as Site, duplicatedFrom: id, ...siteGeography(copy) });
		await writePlans(tx, copy.id, planRows);
		const slug = await claimSlug(tx, copy.id, copy.name);
		return { id: copy.id, slug, name: copy.name };
	});
}

// Reject malformed ids before they reach Postgres, which would throw on the uuid cast.
export function siteId(id: string): string {
	if (!UUID.test(id)) error(404, 'Site not found');
	return id;
}
