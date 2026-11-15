import type { StoredPlan, StoredSite } from '../modeler/existing';

// A site as stored: its row's `data` (settings and existing conditions) and one row per plan.
// Pure, so it's tested without a database.

export interface PlanRow {
	id: string;
	slug: string;
	name: string;
	position: number;
	oldSlugs: string[] | null;
	data: Record<string, unknown>;
}

// The raw site to normalize: plan rows in order, or, for a site saved before the plans table
// (no rows yet), the plans still inside its data
export function siteFromRows(data: Record<string, unknown>, planRows: PlanRow[]): Record<string, unknown> {
	if (!planRows.length) return data;
	const sorted = [...planRows].sort((a, b) => a.position - b.position);
	return {
		...data,
		plans: sorted.map((r) => ({ ...r.data, id: r.id, slug: r.slug, name: r.name, ...(r.oldSlugs?.length ? { oldSlugs: r.oldSlugs } : {}) })),
	};
}

// The other way: the site row's data (no plans) and a row per plan
export function rowsFromSite(site: StoredSite): { data: Omit<StoredSite, 'plans'>; plans: PlanRow[] } {
	const { plans, ...data } = site;
	return {
		data,
		plans: plans.map((p: StoredPlan, i) => {
			const { id, slug, name, oldSlugs, ...rest } = p;
			return { id, slug, name, position: i, oldSlugs: oldSlugs ?? null, data: rest as Record<string, unknown> };
		}),
	};
}
