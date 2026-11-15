import { error, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, like, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from './db';
import { committees, plans, sites, siteSlugs } from './db/schema';
import { canDeleteSite, canEdit, canManageCommittee, canSaveInto, canView, type SiteAccess } from './access';
import type { CurrentUser } from './auth';
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
	visibility: 'public' | 'members';
	committee: { id: string; name: string } | null;
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

// The sites a user can open in the editor: their committees' (the team sees every committee's)
export async function listSites(user: CurrentUser | null): Promise<SiteSummary[]> {
	if (!user) return [];
	const committeeIds = user.memberships.map((m) => m.committeeId);
	const rows = await db
		.select({
			id: sites.id,
			slug: sites.slug,
			name: sites.name,
			duplicatedFrom: sites.duplicatedFrom,
			updatedAt: sites.updatedAt,
			visibility: sites.visibility,
			committeeId: sites.committeeId,
			committeeName: committees.name,
			data: sites.data,
		})
		.from(sites)
		.leftJoin(committees, eq(committees.id, sites.committeeId))
		.where(user.isTeam ? undefined : committeeIds.length ? inArray(sites.committeeId, committeeIds) : sql`false`)
		.orderBy(desc(sites.updatedAt));
	const planRows = await planRowsFor(rows.map((r) => r.id));
	return rows.map(({ data, committeeId, committeeName, ...row }) => ({
		...row,
		committee: committeeId ? { id: committeeId, name: committeeName ?? '' } : null,
		plans: normalizeSite(siteFromRows(data as unknown as Record<string, unknown>, planRows.get(row.id) ?? [])).plans.map((p) => ({
			name: p.name,
			slug: p.slug,
			developmentType: developmentType(p),
		})),
	}));
}

// Who owns a site and who may open its view link
async function accessOf(id: string): Promise<(SiteAccess & { version: number }) | null> {
	const [row] = await db.select({ committeeId: sites.committeeId, visibility: sites.visibility, version: sites.version }).from(sites).where(eq(sites.id, id));
	return row ?? null;
}

// A site through the API: anyone who can view it. A private site reads as not found to others.
export async function getSite(id: string, user: CurrentUser | null): Promise<Site> {
	const access = await accessOf(id);
	if (!access || !canView(access, user)) error(404, 'Site not found');
	const [row] = await db.select({ data: sites.data }).from(sites).where(eq(sites.id, id));
	return readSite(id, row.data);
}

// Resolves a current or old site slug, or a bare uuid from links made before slugs.
async function getSiteBySlug(slug: string): Promise<{ id: string; site: Site; slug: string; access: SiteAccess & { version: number } }> {
	const columns = { id: sites.id, data: sites.data, slug: sites.slug, committeeId: sites.committeeId, visibility: sites.visibility, version: sites.version };
	const [row] = UUID.test(slug)
		? await db.select(columns).from(sites).where(eq(sites.id, slug))
		: await db.select(columns).from(siteSlugs).innerJoin(sites, eq(sites.id, siteSlugs.siteId)).where(eq(siteSlugs.slug, slug.toLowerCase()));
	if (!row) error(404, 'Site not found');
	return { id: row.id, site: await readSite(row.id, row.data), slug: row.slug, access: { committeeId: row.committeeId, visibility: row.visibility, version: row.version } };
}

// What the page needs to know about the viewer's rights on a site
export interface SiteRights {
	canEdit: boolean;
	canDelete: boolean;
	visibility: 'public' | 'members';
	committee: { id: string; name: string } | null;
	version: number;
}

// Page load for /modeler/<site>[/<plan>][/view]. No plan is the site view (existing
// conditions); an unknown plan goes there too. Old site or plan slugs redirect to the current ones.
// The editor needs edit rights (viewers go to the view link); the view link needs view rights.
// A private site is "not found" to anyone else, signed-out visitors are asked to sign in.
export async function loadPlanRoute(
	siteParam: string,
	planParam: string | undefined,
	readOnly: boolean,
	user: CurrentUser | null,
	path: string,
): Promise<{ site: Site; siteSlug: string; planId: string; rights: SiteRights }> {
	const { site, slug, access } = await getSiteBySlug(siteParam);
	const viewable = canView(access, user);
	const editable = canEdit(access, user);
	if (!viewable) {
		if (!user) redirect(303, `/signin?next=${encodeURIComponent(path)}`);
		error(404, 'Site not found');
	}
	const plan = (planParam && findPlanBySlug(site.plans, planParam)) || site.existing;
	if (!readOnly && !editable) redirect(303, planUrl(slug, plan.slug, true));
	if (siteParam !== slug || (planParam ?? '') !== plan.slug) redirect(307, planUrl(slug, plan.slug, readOnly));
	const [committee] = access.committeeId ? await db.select({ id: committees.id, name: committees.name }).from(committees).where(eq(committees.id, access.committeeId)) : [];
	return {
		site,
		siteSlug: slug,
		planId: plan.id,
		rights: { canEdit: editable, canDelete: canDeleteSite(access, user), visibility: access.visibility, committee: committee ?? null, version: access.version },
	};
}

// What's on screen at save, as a small image: a plan's id, or null for existing conditions
function parseThumbnail(body: unknown): { planId: string | null; image: string } | undefined {
	const t = (body as { thumbnail?: { planId?: unknown; image?: unknown } } | null)?.thumbnail;
	if (!t || typeof t.image !== 'string' || !t.image.startsWith('data:image/') || t.image.length > 300_000) return undefined;
	return { planId: typeof t.planId === 'string' ? t.planId : null, image: t.image };
}

// The committee a new site goes into: the one asked for, if the user may save there; otherwise
// their only committee
function committeeFor(body: unknown, user: CurrentUser): string {
	const asked = (body as { committeeId?: unknown } | null)?.committeeId;
	if (typeof asked === 'string') {
		if (!canSaveInto(asked, user)) error(403, 'You are not a member of that committee');
		return asked;
	}
	if (user.memberships.length === 1) return user.memberships[0].committeeId;
	error(400, user.memberships.length ? 'Choose a committee for the site' : 'Join or start a committee to save sites');
}

// Insert or update. The client generates Site.id, so the first save and later saves share one path.
// The site row holds its settings and existing conditions; each plan is a row of its own.
// Saves carry the version they were made from: if someone else saved since, the save is refused
// (409) rather than overwriting their work.
export async function saveSite(id: string, body: unknown, user: CurrentUser | null): Promise<SiteRef> {
	if (!user) error(401, 'Sign in to save');
	const site = parseBody(body);
	if (site.id !== id) error(400, 'Site id does not match URL');
	const thumbnail = parseThumbnail(body);
	const baseVersion = (body as { baseVersion?: unknown }).baseVersion;
	const { data, plans: planRows } = rowsFromSite(storedSite(site));
	const siteThumbnail = thumbnail && !thumbnail.planId ? { thumbnail: thumbnail.image } : {};
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ slug: sites.slug, version: sites.version, committeeId: sites.committeeId, visibility: sites.visibility })
			.from(sites)
			.where(eq(sites.id, id))
			.for('update');
		const geo = siteGeography(site);
		let version: number;
		if (existing) {
			if (!canEdit(existing, user)) error(404, 'Site not found');
			if (typeof baseVersion === 'number' && baseVersion !== existing.version) error(409, 'Someone else saved this site');
			version = existing.version + 1;
			await tx
				.update(sites)
				.set({ name: site.name, data: data as Site, ...geo, ...siteThumbnail, version, updatedAt: sql`now()` })
				.where(eq(sites.id, id));
		} else {
			version = 0;
			// Placeholder until claimSlug sets the real one: the column is unique and not null
			await tx.insert(sites).values({ id, slug: id, name: site.name, data: data as Site, committeeId: committeeFor(body, user), ...geo, ...siteThumbnail });
		}
		await writePlans(tx, id, planRows, thumbnail?.planId ? { planId: thumbnail.planId, image: thumbnail.image } : undefined);
		const slug = await claimSlug(tx, id, site.name, existing?.slug);
		return { id, slug, name: site.name, version };
	});
}

export async function deleteSite(id: string, user: CurrentUser | null): Promise<void> {
	const access = await accessOf(id);
	if (!access || !canEdit(access, user)) error(404, 'Site not found');
	if (!canDeleteSite(access, user)) error(403, 'Only committee leads can delete sites');
	await db.delete(sites).where(eq(sites.id, id));
}

// A copy in the same committee, or another the user belongs to
export async function duplicateSite(id: string, user: CurrentUser | null, committeeId?: string): Promise<SiteRef> {
	if (!user) error(401, 'Sign in to duplicate');
	const access = await accessOf(id);
	if (!access || !canEdit(access, user)) error(404, 'Site not found');
	const target = committeeId ?? access.committeeId;
	if (!target || !canSaveInto(target, user)) error(403, 'You are not a member of that committee');
	const source = await getSite(id, user);
	// Plans get new ids: a plan row belongs to one site
	const copy: Site = { ...source, id: crypto.randomUUID(), name: `${source.name || 'Untitled'} copy`, plans: source.plans.map((p) => ({ ...p, id: crypto.randomUUID() })) };
	const { data, plans: planRows } = rowsFromSite(storedSite(copy));
	return db.transaction(async (tx) => {
		await tx.insert(sites).values({ id: copy.id, slug: copy.id, name: copy.name, data: data as Site, duplicatedFrom: id, committeeId: target, visibility: access.visibility, ...siteGeography(copy) });
		await writePlans(tx, copy.id, planRows);
		const slug = await claimSlug(tx, copy.id, copy.name);
		return { id: copy.id, slug, name: copy.name, version: 0 };
	});
}

// Site settings: who can open its view link, and which committee owns it (leads and the team)
export async function updateSiteSettings(id: string, patch: { visibility?: unknown; committeeId?: unknown }, user: CurrentUser | null): Promise<void> {
	const access = await accessOf(id);
	if (!access || !canEdit(access, user)) error(404, 'Site not found');
	const set: Partial<typeof sites.$inferInsert> = {};
	if (patch.visibility !== undefined) {
		if (patch.visibility !== 'public' && patch.visibility !== 'members') error(400, 'visibility is public or members');
		set.visibility = patch.visibility;
	}
	if (patch.committeeId !== undefined) {
		if (typeof patch.committeeId !== 'string') error(400, 'committeeId is required');
		const fromOk = access.committeeId ? canManageCommittee(access.committeeId, user) : user!.isTeam;
		if (!fromOk || !canSaveInto(patch.committeeId, user)) error(403, 'Only leads can move a site, into a committee they belong to');
		set.committeeId = patch.committeeId;
	}
	if (Object.keys(set).length) await db.update(sites).set(set).where(eq(sites.id, id));
}

// Reject malformed ids before they reach Postgres, which would throw on the uuid cast.
export function siteId(id: string): string {
	if (!UUID.test(id)) error(404, 'Site not found');
	return id;
}
