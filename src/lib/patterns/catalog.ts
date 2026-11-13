import type { BuildingType, CongregationProfile, Site } from '../modeler/types';

// The pattern catalog. Placeholder content shaped like a future Directus collection: the team
// replaces these patterns (and tunes WEIGHTS) without code changes. getPatterns() is the one
// place a Directus fetch would go.

export type Intervention = 'reuse' | 'new' | 'both' | 'none';
export type HousingScale = 'none' | 'some' | 'significant';

// What a pattern fits. A missing trait means "any".
export interface PatternTraits {
	buildingTypes?: BuildingType[];
	siteTypes?: NonNullable<Site['siteType']>[];
	interventions?: Intervention[];
	housing?: HousingScale[];
	size?: NonNullable<CongregationProfile['size']>[];
	tenure?: NonNullable<CongregationProfile['tenure']>[];
	ownership?: NonNullable<CongregationProfile['ownership']>[];
	partnering?: NonNullable<CongregationProfile['partnering']>[];
	capacity?: NonNullable<CongregationProfile['capacity']>[];
	change?: NonNullable<CongregationProfile['change']>[];
	role?: NonNullable<CongregationProfile['role']>[];
}

export type TraitKey = keyof PatternTraits;

export interface Pattern {
	slug: string;
	name: string;
	summary: string;
	sections: { heading: string; text: string }[];
	placeholder: boolean; // true until the team writes the real pattern
	traits: PatternTraits;
}

// How much each trait counts toward a match. Team-tunable (PLAN.md: pattern-matching weights
// are a design decision). Spatial traits start heavier than culture.
export const WEIGHTS: Record<TraitKey, number> = {
	buildingTypes: 3,
	interventions: 3,
	siteTypes: 2,
	housing: 2,
	size: 1,
	tenure: 1,
	ownership: 1,
	partnering: 1,
	capacity: 1,
	change: 1,
	role: 1,
};

// The analysis shows a pattern only when the best fit reaches this, so people see one confident
// answer or none. Team-tunable, like WEIGHTS.
export const MATCH_THRESHOLD = 0.75;

const placeholderSections = (fits: string): Pattern['sections'] => [
	{ heading: 'What it is', text: 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' },
	{ heading: 'Where it fits', text: fits },
	{ heading: 'Stories', text: 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' },
];

const PATTERNS: Pattern[] = [
	{
		slug: 'urban-box-adaptive-reuse',
		name: 'Urban box, adaptive reuse',
		summary: 'A single church building in the city, with part of it reused for housing or community space.',
		sections: placeholderSections('Urban sites with one simple building, where part of the building can take on a new use.'),
		placeholder: true,
		traits: { buildingTypes: ['box'], siteTypes: ['urban'], interventions: ['reuse'], housing: ['some', 'significant'], change: ['adapt'], role: ['housing_partner', 'service'] },
	},
	{
		slug: 'urban-box-plus-adaptive-reuse',
		name: 'Urban box-plus, adaptive reuse',
		summary: 'A church that grew by additions, with a wing or upper floors reused for housing.',
		sections: placeholderSections('Urban sites where a sanctuary and its additions form one building, and a wing can be converted.'),
		placeholder: true,
		traits: { buildingTypes: ['box_plus'], siteTypes: ['urban'], interventions: ['reuse', 'both'], housing: ['some', 'significant'], partnering: ['open'], capacity: ['some_staff', 'staffed'] },
	},
	{
		slug: 'suburban-box-plus-new-construction',
		name: 'Suburban box-plus, new construction on the lot',
		summary: 'New housing built on part of a larger suburban lot, often on surplus parking.',
		sections: placeholderSections('Suburban sites with room to build: large lots, underused parking, a congregation open to a development partner.'),
		placeholder: true,
		traits: { buildingTypes: ['box_plus', 'box'], siteTypes: ['suburban'], interventions: ['new', 'both'], housing: ['significant'], partnering: ['open'], change: ['adapt', 'transform'] },
	},
	{
		slug: 'rural-cluster-cottage-housing',
		name: 'Rural cluster, cottage housing',
		summary: 'A small group of cottages added near a rural church and its outbuildings.',
		sections: placeholderSections('Rural and edge-of-town sites with several buildings and open land around them.'),
		placeholder: true,
		traits: { buildingTypes: ['cluster'], siteTypes: ['rural', 'suburban'], interventions: ['new'], housing: ['some'], size: ['small', 'medium'], change: ['adapt'] },
	},
	{
		slug: 'object-church-hall-reuse',
		name: 'Object church, reuse of a parish hall',
		summary: 'A mid-century object church kept as it is, with its hall or school reused.',
		sections: placeholderSections('Sites with a distinctive radial or triangular sanctuary that the congregation wants to keep intact.'),
		placeholder: true,
		traits: { buildingTypes: ['object'], siteTypes: ['suburban', 'urban'], interventions: ['reuse'], housing: ['some'], change: ['preserve', 'adapt'] },
	},
	{
		slug: 'urban-cluster-partner-campus',
		name: 'Urban cluster, campus of partners',
		summary: 'Several buildings on one block shared with housing and service partners.',
		sections: placeholderSections('Urban campuses with a school, rectory or hall alongside the church, and partners ready to share them.'),
		placeholder: true,
		traits: { buildingTypes: ['cluster'], siteTypes: ['urban'], interventions: ['both', 'reuse', 'new'], housing: ['significant'], partnering: ['open'], capacity: ['staffed'], role: ['service', 'housing_partner'], size: ['medium', 'large'] },
	},
	{
		slug: 'shared-space-small-congregation',
		name: 'Shared space, small congregation',
		summary: 'A small congregation that keeps its building and opens it to the neighborhood.',
		sections: placeholderSections('Congregations that own their building and want it to be a gathering place before taking on construction.'),
		placeholder: true,
		traits: { interventions: ['none', 'reuse'], housing: ['none', 'some'], size: ['small'], ownership: ['owned'], change: ['preserve'], role: ['gathering'] },
	},
	{
		slug: 'leased-space-partnership',
		name: 'Leased space, partnership',
		summary: 'A congregation in leased space working through partners rather than its own property.',
		sections: placeholderSections('Congregations that lease, where change happens through partnerships rather than building.'),
		placeholder: true,
		traits: { ownership: ['leased'], interventions: ['none'], partnering: ['open', 'unsure'], role: ['gathering', 'service'] },
	},
];

export async function getPatterns(): Promise<Pattern[]> {
	return PATTERNS;
}

export async function getPattern(slug: string): Promise<Pattern | undefined> {
	return PATTERNS.find((p) => p.slug === slug);
}
