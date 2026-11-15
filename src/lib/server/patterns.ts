import { asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { patterns, patternSections, patternVariants, plans, sites } from './db/schema';
import { patternFromRows } from './pattern-rows';
import { planUrl } from '../modeler/api';
import type { Pattern, PatternExample } from '../patterns/catalog';

// The pattern catalog, read from its tables (edited in the CMS), in editorial order

type Row = typeof patterns.$inferSelect;

async function assemble(rows: Row[]): Promise<Pattern[]> {
	if (!rows.length) return [];
	const ids = rows.map((r) => r.id);
	const [sections, variants] = await Promise.all([
		db.select().from(patternSections).where(inArray(patternSections.patternId, ids)).orderBy(asc(patternSections.sort)),
		db.select().from(patternVariants).where(inArray(patternVariants.patternId, ids)).orderBy(asc(patternVariants.sort)),
	]);
	const examples = await examplesFor(rows);
	return rows.map((r) =>
		patternFromRows(
			r,
			sections.filter((s) => s.patternId === r.id),
			variants.filter((v) => v.patternId === r.id),
			examples.get(r.id),
		),
	);
}

// Each pattern's example site: a plan, or the site's existing conditions when no plan is set
async function examplesFor(rows: Row[]): Promise<Map<string, PatternExample>> {
	const out = new Map<string, PatternExample>();
	const siteIds = [...new Set(rows.map((r) => r.exampleSiteId).filter((id): id is string => !!id))];
	if (!siteIds.length) return out;
	const planIds = rows.map((r) => r.examplePlanId).filter((id): id is string => !!id);
	const [siteRows, planRows] = await Promise.all([
		db.select({ id: sites.id, slug: sites.slug, name: sites.name, thumbnail: sites.thumbnail }).from(sites).where(inArray(sites.id, siteIds)),
		planIds.length
			? db.select({ id: plans.id, slug: plans.slug, name: plans.name, thumbnail: plans.thumbnail }).from(plans).where(inArray(plans.id, planIds))
			: Promise.resolve([]),
	]);
	for (const r of rows) {
		const site = siteRows.find((s) => s.id === r.exampleSiteId);
		if (!site) continue;
		const plan = planRows.find((p) => p.id === r.examplePlanId);
		out.set(r.id, {
			siteName: site.name || 'Untitled',
			planName: plan ? plan.name || 'Untitled plan' : 'Existing conditions',
			url: planUrl(site.slug, plan?.slug ?? '', true),
			thumbnail: (plan ? plan.thumbnail : site.thumbnail) ?? null,
		});
	}
	return out;
}

export async function listPatterns(): Promise<Pattern[]> {
	return assemble(await db.select().from(patterns).orderBy(asc(patterns.sort), asc(patterns.name)));
}

export async function getPatternBySlug(slug: string): Promise<Pattern | undefined> {
	const [pattern] = await assemble(await db.select().from(patterns).where(eq(patterns.slug, slug)));
	return pattern;
}

// Pegs a site's plan (or its existing conditions, with no plan) as the pattern's example
export async function setPatternExample(slug: string, siteId: string, planId: string | null): Promise<boolean> {
	if (planId) {
		const [plan] = await db.select({ siteId: plans.siteId }).from(plans).where(eq(plans.id, planId));
		if (plan?.siteId !== siteId) return false;
	}
	const updated = await db
		.update(patterns)
		.set({ exampleSiteId: siteId, examplePlanId: planId })
		.where(eq(patterns.slug, slug))
		.returning({ id: patterns.id });
	return updated.length > 0;
}
