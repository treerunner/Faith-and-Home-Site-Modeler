import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq, like, ne, or, sql } from 'drizzle-orm';
import { db } from './db';
import { sites, siteSlugs } from './db/schema';
import { normalizeSite, SiteFormatError } from '../modeler/serialize';
import { findPlanBySlug, pickSlug, RESERVED_SITE_SLUGS, slugify } from '../modeler/slug';
import { planUrl, type SiteRef } from '../modeler/api';
import type { Site } from '../modeler/types';

export interface SiteSummary {
	id: string;
	slug: string;
	name: string;
	duplicatedFrom: string | null;
	updatedAt: Date;
	plans: { name: string; slug: string }[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
	return rows.map(({ data, ...row }) => ({
		...row,
		plans: normalizeSite(data).plans.map((p) => ({ name: p.name, slug: p.slug })),
	}));
}

export async function getSite(id: string): Promise<Site> {
	const [row] = await db.select({ data: sites.data }).from(sites).where(eq(sites.id, id));
	if (!row) error(404, 'Site not found');
	return normalizeSite(row.data);
}

// Resolves a current or old site slug, or a bare uuid from links made before slugs.
async function getSiteBySlug(slug: string): Promise<{ site: Site; slug: string }> {
	const [row] = UUID.test(slug)
		? await db.select({ data: sites.data, slug: sites.slug }).from(sites).where(eq(sites.id, slug))
		: await db
				.select({ data: sites.data, slug: sites.slug })
				.from(siteSlugs)
				.innerJoin(sites, eq(sites.id, siteSlugs.siteId))
				.where(eq(siteSlugs.slug, slug.toLowerCase()));
	if (!row) error(404, 'Site not found');
	return { site: normalizeSite(row.data), slug: row.slug };
}

// Page load for /modeler/<site>[/<plan>][/view]. A missing or unknown plan goes to the
// site's first plan; old site or plan slugs redirect to the current ones.
export async function loadPlanRoute(
	siteParam: string,
	planParam: string | undefined,
	readOnly: boolean,
): Promise<{ site: Site; siteSlug: string; planId: string }> {
	const { site, slug } = await getSiteBySlug(siteParam);
	const plan = (planParam && findPlanBySlug(site.plans, planParam)) || site.plans[0];
	if (siteParam !== slug || planParam !== plan.slug) redirect(307, planUrl(slug, plan.slug, readOnly));
	return { site, siteSlug: slug, planId: plan.id };
}

// Insert or update. The client generates Site.id, so the first save and later saves share one path.
export async function saveSite(id: string, body: unknown): Promise<SiteRef> {
	const site = parseBody(body);
	if (site.id !== id) error(400, 'Site id does not match URL');
	return db.transaction(async (tx) => {
		const [existing] = await tx.select({ slug: sites.slug }).from(sites).where(eq(sites.id, id));
		if (existing) {
			await tx
				.update(sites)
				.set({ name: site.name, data: site, updatedAt: sql`now()` })
				.where(eq(sites.id, id));
		} else {
			// Placeholder until claimSlug sets the real one: the column is unique and not null
			await tx.insert(sites).values({ id, slug: id, name: site.name, data: site });
		}
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
	const copy: Site = { ...source, id: crypto.randomUUID(), name: `${source.name || 'Untitled'} copy` };
	return db.transaction(async (tx) => {
		await tx.insert(sites).values({ id: copy.id, slug: copy.id, name: copy.name, data: copy, duplicatedFrom: id });
		const slug = await claimSlug(tx, copy.id, copy.name);
		return { id: copy.id, slug, name: copy.name };
	});
}

// Reject malformed ids before they reach Postgres, which would throw on the uuid cast.
export function siteId(id: string): string {
	if (!UUID.test(id)) error(404, 'Site not found');
	return id;
}
