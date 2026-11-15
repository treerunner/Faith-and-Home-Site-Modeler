// Existing conditions and plans. The site's existing buildings are drawn once, in
// `site.existing`; every plan inherits them live and can only say what happens to each piece:
// to be removed, reuse zones, added stories, a different roof. Plans can't move, reshape or
// cut them.
//
// In memory a plan holds the full list (the site's pieces with its choices applied, then its
// own new pieces), so rendering, metrics and editing read `plan.structures` as before. Saved,
// a plan holds only its new pieces and its choices: nothing derived is stored.

import type { Plan, ReuseZone, Roof, Site, Structure } from './types';

// What a plan says about one of the site's pieces
export interface ExistingChoice {
	removed?: true;
	addedStories?: number;
	roof?: Roof;
	reuseZones?: ReuseZone[];
}

export type ExistingChoices = Record<string, ExistingChoice>;

// A plan as saved: its own pieces only, plus its choices about the site's
export type StoredPlan = Plan & { existingChoices?: ExistingChoices };
export type StoredSite = Omit<Site, 'plans'> & { plans: StoredPlan[] };

function clone<T>(v: T): T {
	return structuredClone(v);
}

export function existingIds(existing: Plan): Set<string> {
	return new Set(existing.structures.map((s) => s.id));
}

// A site piece as a plan sees it: the site's shape and settings, the plan's choices
function applyChoice(base: Structure, choice: ExistingChoice | undefined): Structure {
	const s: Structure = { ...clone(base), status: choice?.removed ? 'removed' : 'existing', reuseZones: undefined };
	if (!choice) return s;
	if (choice.addedStories) s.addedStories = choice.addedStories;
	if (choice.roof) {
		s.roof = choice.roof;
		s.planRoof = choice.roof;
	}
	const partIds = new Set(base.parts.map((p) => p.id));
	const zones = choice.removed ? [] : (choice.reuseZones ?? []).filter((z) => partIds.has(z.partId));
	// Zones stay within the site's floors: added stories are new construction, not reuse
	const top = base.stories, bottom = base.basement ? 0 : 1;
	const fitted = zones
		.filter((z) => z.floors[0] <= top)
		.map((z) => ({ ...clone(z), floors: [Math.max(z.floors[0], bottom), Math.min(z.floors[1], top)] as [number, number] }));
	if (fitted.length) s.reuseZones = fitted;
	return s;
}

// The plan's choices, read from its copies of the site's pieces
export function choicesOf(existing: Plan, plan: Plan): ExistingChoices {
	const ids = existingIds(existing);
	const out: ExistingChoices = {};
	for (const s of plan.structures) {
		if (!ids.has(s.id)) continue;
		const c: ExistingChoice = {};
		if (s.status === 'removed') c.removed = true;
		if (s.addedStories) c.addedStories = s.addedStories;
		if (s.planRoof) c.roof = s.planRoof;
		if (s.reuseZones?.length) c.reuseZones = clone(s.reuseZones);
		if (Object.keys(c).length) out[s.id] = c;
	}
	return out;
}

// Stored form to full form
export function expandPlan(existing: Plan, plan: StoredPlan): Plan {
	const { existingChoices = {}, ...rest } = plan;
	const ids = existingIds(existing);
	return {
		...rest,
		structures: [
			...existing.structures.map((b) => applyChoice(b, existingChoices[b.id])),
			...plan.structures.filter((s) => !ids.has(s.id)),
		],
	};
}

// Full form to stored form
export function compactPlan(existing: Plan, plan: Plan): StoredPlan {
	const ids = existingIds(existing);
	const choices = choicesOf(existing, plan);
	return {
		...plan,
		structures: plan.structures.filter((s) => !ids.has(s.id)),
		...(Object.keys(choices).length ? { existingChoices: choices } : {}),
	};
}

// Refreshes a plan's copies from the site after the site changed, keeping its choices. Zones
// are matched by part, so they follow a part the site moved to another structure.
export function syncPlan(existing: Plan, plan: Plan): Plan {
	const choices = choicesOf(existing, plan);
	const zones = plan.structures.flatMap((s) => s.reuseZones ?? []);
	for (const b of existing.structures) {
		const partIds = new Set(b.parts.map((p) => p.id));
		const mine = zones.filter((z) => partIds.has(z.partId));
		const c: ExistingChoice = { ...choices[b.id] };
		if (mine.length) c.reuseZones = mine;
		else delete c.reuseZones;
		if (Object.keys(c).length) choices[b.id] = c;
		else delete choices[b.id];
	}
	// A plan's own pieces are always new; copies of the site's are existing or removed
	const own = plan.structures.filter((s) => s.status === 'new');
	return expandPlan(existing, { ...plan, structures: own, existingChoices: choices });
}

export function storedSite(site: Site): StoredSite {
	return { ...site, plans: site.plans.map((p) => compactPlan(site.existing, p)) };
}

// A fresh plan's pieces: the site's, with no choices
export function freshStructures(existing: Plan): Structure[] {
	return existing.structures.map((b) => applyChoice(b, undefined));
}

// What plans say about one site piece, for a warning before the site deletes it
export function choicesOn(site: Site, structureId: string): { removed: number; zones: number; added: number } {
	const out = { removed: 0, zones: 0, added: 0 };
	for (const p of site.plans) {
		const s = p.structures.find((s) => s.id === structureId);
		if (!s) continue;
		if (s.status === 'removed') out.removed++;
		if (s.reuseZones?.length) out.zones++;
		if (s.addedStories) out.added++;
	}
	return out;
}
