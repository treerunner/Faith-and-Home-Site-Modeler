import { BUILDING_TYPE_LABELS, buildingType, dwellingsEstimate, reuseZoneCount } from '../modeler/metrics';
import type { Plan, Site } from '../modeler/types';
import { WEIGHTS, type HousingScale, type Intervention, type Pattern, type TraitKey } from './catalog';

// Matches a site and its congregation to patterns: what the model knows (building type, site
// type, reuse and new construction, housing) plus the Social answers. Pure.

export type Facts = Partial<Record<TraitKey, string>>;

const SIGNIFICANT_HOUSING = 10; // units

export function siteFacts(site: Site, plan: Plan): Facts {
	const facts: Facts = {};
	const built = plan.structures.some((s) => s.status !== 'removed');
	const type = buildingType(plan);
	if (type) facts.buildingTypes = type;
	if (site.siteType) facts.siteTypes = site.siteType;
	if (built) {
		const reuse = reuseZoneCount(plan) > 0;
		const added = plan.structures.some((s) => s.status === 'new');
		const intervention: Intervention = reuse && added ? 'both' : reuse ? 'reuse' : added ? 'new' : 'none';
		facts.interventions = intervention;
		const units = dwellingsEstimate(plan);
		const housing: HousingScale = units >= SIGNIFICANT_HOUSING ? 'significant' : units > 0 ? 'some' : 'none';
		facts.housing = housing;
	}
	const p = site.congregationProfile ?? {};
	for (const key of ['size', 'tenure', 'ownership', 'partnering', 'capacity', 'change', 'role'] as const) {
		if (p[key]) facts[key] = p[key];
	}
	return facts;
}

// How a trait value reads in a reason: "Box-Plus", "adaptive reuse", "open to partners"
const VALUE_LABELS: Record<TraitKey, Record<string, string>> = {
	buildingTypes: BUILDING_TYPE_LABELS,
	siteTypes: { urban: 'urban site', suburban: 'suburban site', rural: 'rural site' },
	interventions: {
		reuse: 'adaptive reuse',
		new: 'new construction',
		both: 'adaptive reuse and new construction',
		none: 'no change to buildings',
	},
	housing: { none: 'no housing', some: 'some housing', significant: `${SIGNIFICANT_HOUSING}+ housing units` },
	size: { small: 'small congregation', medium: 'medium congregation', large: 'large congregation' },
	tenure: { new: 'new to the building', recent: 'recent tenure', established: 'established tenure', historic: 'historic tenure' },
	ownership: { owned: 'owns the property', leased: 'leases its space' },
	partnering: { open: 'open to partners', unsure: 'unsure about partners', not_now: 'not partnering now' },
	capacity: { volunteers: 'volunteer stewards', some_staff: 'some staff', staffed: 'dedicated staff' },
	change: { preserve: 'preserve the property', adapt: 'adapt the property', transform: 'transform the property' },
	role: { gathering: 'gathering place', service: 'service provider', housing_partner: 'housing partner' },
};

export const traitLabel = (key: TraitKey, value: string) => VALUE_LABELS[key][value] ?? value;

export interface PatternMatch {
	pattern: Pattern;
	fit: number; // 0..1 of the weight that could count
	matches: string[];
	differs: string[];
}

// Each trait the pattern names and the site has an answer for counts by its weight: toward the
// fit when the answer is one the pattern allows. Unanswered facts neither help nor hurt.
export function scorePattern(pattern: Pattern, facts: Facts): PatternMatch {
	let possible = 0;
	let earned = 0;
	const matches: string[] = [];
	const differs: string[] = [];
	for (const [key, allowed] of Object.entries(pattern.traits) as [TraitKey, string[]][]) {
		const fact = facts[key];
		if (!fact) continue;
		possible += WEIGHTS[key];
		if (allowed.includes(fact)) {
			earned += WEIGHTS[key];
			matches.push(traitLabel(key, fact));
		} else {
			differs.push(traitLabel(key, fact));
		}
	}
	return { pattern, fit: possible ? earned / possible : 0, matches, differs };
}

// Best fit first; ties go to the pattern that agrees on more, then by name.
export function rankPatterns(patterns: Pattern[], facts: Facts): PatternMatch[] {
	return patterns
		.map((p) => scorePattern(p, facts))
		.sort((a, b) => b.fit - a.fit || b.matches.length - a.matches.length || a.pattern.name.localeCompare(b.pattern.name));
}

// Too little known to trust the ranking: suggest what would sharpen it.
export function matchHint(facts: Facts): string | null {
	if (!facts.buildingTypes) return 'Add buildings to the model for a closer match.';
	const culture = (['size', 'ownership', 'partnering', 'capacity', 'change', 'role'] as const).filter((k) => facts[k]);
	if (!facts.siteTypes) return 'Choose a site type for a closer match.';
	if (culture.length < 2) return 'Answer the Social questions for a closer match.';
	return null;
}
