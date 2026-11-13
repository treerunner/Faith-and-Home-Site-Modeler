import { BUILDING_TYPE_LABELS, buildingType, DEVELOPMENT_TYPE_LABELS, developmentType } from '../modeler/metrics';
import type { BuildingType, CongregationProfile, DevelopmentType, Plan, Site } from '../modeler/types';
import {
	BUILDING_TYPES,
	DEVELOPMENT_TYPES,
	SITE_TYPES,
	type Pattern,
	type SiteType,
	type SocialConditions,
	type Variant,
} from './catalog';

// The pattern matrix as a formula: the model places a site in one cell, a pattern covers a
// set of cells, and social answers pick a variant within the pattern. Pure.

export interface Cell {
	buildingType?: BuildingType;
	siteType?: SiteType;
	developmentType?: DevelopmentType;
}

export type CompleteCell = Required<Cell>;
export type Axis = keyof Cell;

export const AXIS_LABELS: Record<Axis, string> = {
	buildingType: 'building type',
	siteType: 'site type',
	developmentType: 'development type',
};

export const SITE_TYPE_LABELS: Record<SiteType, string> = { urban: 'Urban', suburban: 'Suburban', rural: 'Rural' };

// Each axis prefers the plan's override, then what the model shows
export function siteCell(site: Site, plan: Plan): Cell {
	return {
		buildingType: buildingType(plan, site) ?? undefined,
		siteType: site.siteType,
		developmentType: developmentType(plan) ?? undefined,
	};
}

export const isComplete = (cell: Cell): cell is CompleteCell =>
	Boolean(cell.buildingType && cell.siteType && cell.developmentType);

// "Urban · Box-Plus · Adaptive reuse"
export function cellLabel(cell: CompleteCell): string {
	return [SITE_TYPE_LABELS[cell.siteType], BUILDING_TYPE_LABELS[cell.buildingType], DEVELOPMENT_TYPE_LABELS[cell.developmentType]].join(' · ');
}

export function covers(pattern: Pattern, cell: CompleteCell): boolean {
	const c = pattern.cells;
	return c.buildingTypes.includes(cell.buildingType) && c.siteTypes.includes(cell.siteType) && c.developmentTypes.includes(cell.developmentType);
}

// The pattern written for this cell. The catalog keeps each cell to at most one pattern.
export function patternForCell(patterns: Pattern[], cell: CompleteCell): Pattern | null {
	return patterns.find((p) => covers(p, cell)) ?? null;
}

// Axes on which a pattern can't cover the cell
function differingAxes(pattern: Pattern, cell: CompleteCell): Axis[] {
	const axes: Axis[] = [];
	if (!pattern.cells.developmentTypes.includes(cell.developmentType)) axes.push('developmentType');
	if (!pattern.cells.buildingTypes.includes(cell.buildingType)) axes.push('buildingType');
	if (!pattern.cells.siteTypes.includes(cell.siteType)) axes.push('siteType');
	return axes;
}

// Lexicographic order; equal keys keep the earlier pattern
function lessThan(a: number[], b: number[]): boolean {
	const i = a.findIndex((v, j) => v !== b[j]);
	return i >= 0 && a[i] < b[i];
}

// The written pattern closest to a cell no pattern covers: fewest differing axes; ties keep the
// development type first (it is what the plan does), then the building type, then the site type,
// then catalog order.
export function nearestPattern(patterns: Pattern[], cell: CompleteCell): { pattern: Pattern; differs: Axis[] } | null {
	const rank = (differs: Axis[]) => [
		differs.length,
		differs.includes('developmentType') ? 1 : 0,
		differs.includes('buildingType') ? 1 : 0,
		differs.includes('siteType') ? 1 : 0,
	];
	let best: { pattern: Pattern; differs: Axis[]; key: number[] } | null = null;
	for (const pattern of patterns) {
		const differs = differingAxes(pattern, cell);
		const key = rank(differs);
		if (!best || lessThan(key, best.key)) best = { pattern, differs, key };
	}
	return best ? { pattern: best.pattern, differs: best.differs } : null;
}

// The first variant, in editorial order, whose every condition is answered and allowed
export function selectVariant(pattern: Pattern, profile: CongregationProfile = {}): Variant | null {
	return (
		pattern.variants?.find((v) =>
			(Object.entries(v.when) as [keyof SocialConditions, string[]][]).every(([key, allowed]) => {
				const answer = profile[key];
				return answer !== undefined && allowed.includes(answer);
			}),
		) ?? null
	);
}

// Every cell of the matrix with the pattern written for it, for the coverage view
export function coverage(patterns: Pattern[]): { cell: CompleteCell; pattern: Pattern | null }[] {
	return SITE_TYPES.flatMap((siteType) =>
		DEVELOPMENT_TYPES.flatMap((developmentType) =>
			BUILDING_TYPES.map((buildingType) => {
				const cell = { buildingType, siteType, developmentType };
				return { cell, pattern: patternForCell(patterns, cell) };
			}),
		),
	);
}

// Social answers in plain words, for variant conditions: "open to partners; some staff or dedicated staff"
const ANSWER_LABELS: { [K in keyof SocialConditions]-?: Record<string, string> } = {
	size: { small: 'small congregation', medium: 'medium congregation', large: 'large congregation' },
	tenure: { new: 'new to the building', recent: 'recent tenure', established: 'established tenure', historic: 'historic tenure' },
	ownership: { owned: 'owns the property', leased: 'leases its space' },
	partnering: { open: 'open to partners', unsure: 'unsure about partners', not_now: 'not partnering now' },
	capacity: { volunteers: 'volunteer stewards', some_staff: 'some staff', staffed: 'dedicated staff' },
	change: { preserve: 'preserve the property', adapt: 'adapt the property', transform: 'transform the property' },
	role: { gathering: 'gathering place', service: 'service provider', housing_partner: 'housing partner' },
};

export function conditionText(when: SocialConditions): string {
	return (Object.entries(when) as [keyof SocialConditions, string[]][])
		.map(([key, allowed]) => allowed.map((a) => ANSWER_LABELS[key][a] ?? a).join(' or '))
		.join('; ');
}
