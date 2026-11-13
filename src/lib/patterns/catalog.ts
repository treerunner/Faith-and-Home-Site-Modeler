import type { BuildingType, CongregationProfile, DevelopmentType, Site } from '../modeler/types';

// The pattern catalog. A site sits in one cell of a matrix: building type x site type x
// development type (4 x 3 x 5 = 60 cells). The team writes patterns for the cells it chooses;
// each pattern covers a set of cells, and no cell belongs to two patterns. Social conditions
// pick a variant within a pattern rather than adding an axis.
//
// Placeholder content shaped like a future Directus collection: the team replaces it without
// code changes. getPatterns() is the one place a Directus fetch would go.

export type SiteType = NonNullable<Site['siteType']>;

export const BUILDING_TYPES: BuildingType[] = ['box', 'box_plus', 'object', 'cluster'];
export const SITE_TYPES: SiteType[] = ['urban', 'suburban', 'rural'];
export const DEVELOPMENT_TYPES: DevelopmentType[] = ['existing', 'reuse', 'new', 'reuse_new', 'downsize_sell'];

// The cells a pattern covers: every combination of the listed values
export interface Cells {
	buildingTypes: BuildingType[];
	siteTypes: SiteType[];
	developmentTypes: DevelopmentType[];
}

// Social answers a variant fits, each a list of allowed answers to a congregation profile question
export type SocialConditions = {
	[K in 'size' | 'tenure' | 'ownership' | 'partnering' | 'capacity' | 'change' | 'role']?: NonNullable<CongregationProfile[K]>[];
};

export interface Variant {
	key: string;
	name: string;
	summary: string;
	when: SocialConditions; // every condition must be answered and allowed
}

export interface Pattern {
	slug: string;
	name: string;
	summary: string;
	sections: { heading: string; text: string }[];
	placeholder: boolean; // true until the team writes the real pattern
	cells: Cells;
	variants?: Variant[]; // in editorial order: the first that fits is shown
}

const placeholderSections = (fits: string): Pattern['sections'] => [
	{ heading: 'What it is', text: 'Placeholder text. The team will describe this pattern, its spatial moves and how congregations have used it.' },
	{ heading: 'Where it fits', text: fits },
	{ heading: 'Stories', text: 'Placeholder text. Case studies and stories will be linked here from the storytelling platform.' },
];

const PARTNER_VARIANTS: Variant[] = [
	{
		key: 'with-partner',
		name: 'With a housing partner',
		summary: 'Placeholder. A development or housing partner leads design, financing and management.',
		when: { partnering: ['open'] },
	},
	{
		key: 'congregation-led',
		name: 'Congregation-led',
		summary: 'Placeholder. The congregation leads, with its own staff stewarding the project.',
		when: { capacity: ['some_staff', 'staffed'] },
	},
];

const PATTERNS: Pattern[] = [
	{
		slug: 'urban-box-adaptive-reuse',
		name: 'Urban box, adaptive reuse',
		summary: 'A single church building in the city, with part of it reused for housing or community space.',
		sections: placeholderSections('Urban sites with one simple building, where part of the building can take on a new use.'),
		placeholder: true,
		cells: { buildingTypes: ['box'], siteTypes: ['urban'], developmentTypes: ['reuse'] },
	},
	{
		slug: 'urban-box-plus-adaptive-reuse',
		name: 'Urban box-plus, adaptive reuse',
		summary: 'A church that grew by additions, with a wing or upper floors reused for housing.',
		sections: placeholderSections('Urban sites where a sanctuary and its additions form one building, and a wing can be converted.'),
		placeholder: true,
		cells: { buildingTypes: ['box_plus'], siteTypes: ['urban'], developmentTypes: ['reuse', 'reuse_new'] },
		variants: PARTNER_VARIANTS,
	},
	{
		slug: 'suburban-new-development-on-the-lot',
		name: 'Suburban box and box-plus, new development on the lot',
		summary: 'New housing built on part of a larger suburban lot, often on surplus parking.',
		sections: placeholderSections('Suburban sites with room to build: large lots and underused parking.'),
		placeholder: true,
		cells: { buildingTypes: ['box', 'box_plus'], siteTypes: ['suburban'], developmentTypes: ['new', 'reuse_new'] },
		variants: PARTNER_VARIANTS,
	},
	{
		slug: 'rural-cluster-cottage-housing',
		name: 'Rural cluster, cottage housing',
		summary: 'A small group of cottages added near a rural church and its outbuildings.',
		sections: placeholderSections('Rural sites with several buildings and open land around them.'),
		placeholder: true,
		cells: { buildingTypes: ['cluster'], siteTypes: ['rural'], developmentTypes: ['new'] },
	},
	{
		slug: 'object-church-hall-reuse',
		name: 'Object church, reuse of a parish hall',
		summary: 'A mid-century object church kept as it is, with its hall or school reused.',
		sections: placeholderSections('Sites with a distinctive object-in-space sanctuary that the congregation wants to keep intact.'),
		placeholder: true,
		cells: { buildingTypes: ['object'], siteTypes: ['urban', 'suburban'], developmentTypes: ['reuse'] },
	},
	{
		slug: 'urban-cluster-partner-campus',
		name: 'Urban cluster, campus of partners',
		summary: 'Several buildings on one block shared with housing and service partners.',
		sections: placeholderSections('Urban campuses with a school, rectory or hall alongside the church.'),
		placeholder: true,
		cells: { buildingTypes: ['cluster'], siteTypes: ['urban'], developmentTypes: ['reuse', 'new', 'reuse_new'] },
	},
	{
		slug: 'stewarding-what-you-have',
		name: 'Stewarding what you have',
		summary: 'Keeping the property as it is and making the most of it for the congregation and the neighborhood.',
		sections: placeholderSections('Any property, when the plan is to keep the buildings as they are.'),
		placeholder: true,
		cells: { buildingTypes: BUILDING_TYPES, siteTypes: SITE_TYPES, developmentTypes: ['existing'] },
		variants: [
			{ key: 'leased', name: 'Leased space', summary: 'Placeholder. Change happens through partnerships rather than property.', when: { ownership: ['leased'] } },
			{ key: 'gathering', name: 'Gathering place', summary: 'Placeholder. Opening the building to the neighborhood for events and groups.', when: { role: ['gathering'] } },
			{ key: 'service', name: 'Service provider', summary: 'Placeholder. Hosting services like food, shelter or daycare in existing space.', when: { role: ['service'] } },
		],
	},
	{
		slug: 'right-sizing-the-property',
		name: 'Right-sizing the property',
		summary: 'Consolidating onto less of the property, or selling land or buildings, to fit the congregation today.',
		sections: placeholderSections('Any property, when the plan is to downsize or sell.'),
		placeholder: true,
		cells: { buildingTypes: BUILDING_TYPES, siteTypes: SITE_TYPES, developmentTypes: ['downsize_sell'] },
		variants: [
			{ key: 'consolidate', name: 'Consolidate and stay', summary: 'Placeholder. Moving into fewer buildings and letting the rest go.', when: { change: ['preserve', 'adapt'] } },
			{ key: 'sell', name: 'Sell to fund the mission', summary: 'Placeholder. Selling land or buildings to fund ministry or relocation.', when: { change: ['transform'] } },
		],
	},
];

export async function getPatterns(): Promise<Pattern[]> {
	return PATTERNS;
}

export async function getPattern(slug: string): Promise<Pattern | undefined> {
	return PATTERNS.find((p) => p.slug === slug);
}
