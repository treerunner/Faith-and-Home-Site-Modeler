import type { Site } from './types';

// URLs are /modeler/<site slug>/<plan slug>. Site slugs are unique across sites (assigned
// by the server); plan slugs are unique within their site. Old slugs are kept so renames
// redirect instead of breaking links.

const MAX_LENGTH = 50;

export const RESERVED_SITE_SLUGS = ['sites', 'new', 'view'];
export const RESERVED_PLAN_SLUGS = ['view'];

export function slugify(name: string): string {
	const slug = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip accents
		.toLowerCase()
		.replace(/['’]/g, '') // "St. Mary's" -> "st-marys"
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (slug.length <= MAX_LENGTH) return slug || 'untitled';
	// Cut at a word boundary when one is reasonably close
	const cut = slug.slice(0, MAX_LENGTH);
	const lastDash = cut.lastIndexOf('-');
	return (lastDash > MAX_LENGTH / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

// Slug for `name`: the plain slug if free, else the first free `-2`, `-3`...
// `current` (the slug the item already has) is kept when it still matches the name,
// so saving without a rename never moves a `grace-church-2` to `grace-church`.
export function pickSlug(
	name: string,
	taken: ReadonlySet<string>,
	reserved: readonly string[],
	current?: string,
): string {
	const base = slugify(name);
	if (current && (current === base || new RegExp(`^${base}-\\d+$`).test(current))) return current;
	const free = (s: string) => !taken.has(s) && !reserved.includes(s);
	if (free(base)) return base;
	for (let n = 2; ; n++) if (free(`${base}-${n}`)) return `${base}-${n}`;
}

// Gives every plan a slug matching its name, unique among the site's plans, current
// and old. A renamed plan's previous slug moves into oldSlugs. Mutates `site`.
export function assignPlanSlugs(site: Site): void {
	for (const plan of site.plans) {
		const taken = new Set<string>();
		for (const other of site.plans) {
			if (other === plan) continue;
			if (other.slug) taken.add(other.slug);
			for (const s of other.oldSlugs ?? []) taken.add(s);
		}
		const next = pickSlug(plan.name, taken, RESERVED_PLAN_SLUGS, plan.slug || undefined);
		if (plan.slug && next !== plan.slug) {
			// A rename back to an old name reuses that slug rather than listing it twice
			plan.oldSlugs = [...(plan.oldSlugs ?? []).filter((s) => s !== next), plan.slug];
		}
		plan.slug = next;
	}
}

// Finds a plan by its current or old slug.
export function findPlanBySlug<P extends { slug: string; oldSlugs?: string[] }>(
	plans: P[],
	slug: string,
): P | undefined {
	return plans.find((p) => p.slug === slug) ?? plans.find((p) => p.oldSlugs?.includes(slug));
}
