import type { BuildingType, CongregationProfile, DevelopmentType, Site } from '../modeler/types';

// The pattern catalog. A site sits in one cell of a matrix: building type x site type x
// development type (4 x 3 x 5 = 60 cells). The team writes patterns for the cells it chooses;
// each pattern covers a set of cells, and no cell belongs to two patterns. Social conditions
// pick a variant within a pattern rather than adding an axis.
//
// The catalog lives in the database (patterns, pattern_sections, pattern_variants), edited in
// the CMS and read on the server (server/patterns.ts). In the browser, getPatterns() fetches it.

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
// One answer to a social question (roles are answered as a list: each is one answer)
type Answer<K extends keyof CongregationProfile> = NonNullable<CongregationProfile[K]> extends (infer A)[] ? A : NonNullable<CongregationProfile[K]>;

export type SocialConditions = {
	[K in 'size' | 'tenure' | 'ownership' | 'partnering' | 'capacity' | 'change' | 'role']?: Answer<K>[];
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
	example?: PatternExample; // a modeled site that shows the pattern
}

// A pattern's example: a plan (or a site's existing conditions) with its thumbnail
export interface PatternExample {
	siteName: string;
	planName: string;
	url: string; // the read-only view
	thumbnail: string | null;
}

export async function getPatterns(): Promise<Pattern[]> {
	const res = await fetch('/api/patterns');
	if (!res.ok) throw new Error(`GET /api/patterns failed: ${res.status}`);
	return res.json();
}
