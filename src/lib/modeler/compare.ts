// Two plans side by side: what each measures, and what changed from A to B. Pure.

import type { Plan, Site, Use } from './types';
import {
	buildingType,
	BUILDING_TYPE_LABELS,
	developmentType,
	DEVELOPMENT_TYPE_LABELS,
	dwellingsByStatus,
	dwellingsEstimate,
	grossFloorArea,
	greenSpaceArea,
	keptPlan,
	lotCoverage,
	parkingArea,
	reuseFloorArea,
	saleArea,
	siteFootprint,
	useFloorAreaByUse,
} from './metrics';
import { cellLabel, isComplete, siteCell } from '../patterns/match';
import { sqmToSqft } from './units';

export interface PlanSummary {
	developmentType: string;
	buildingType: string;
	cell: string;
	gfa: number; // m²
	footprint: number; // m²
	coverage: number | null; // %
	reuse: number; // m² of adaptive reuse
	units: number;
	unitsReuse: number;
	unitsNew: number;
	green: number; // m²
	parking: number; // m²
	sale: number; // m² of land to sell
	uses: Partial<Record<Use, number>>; // m² by use
}

// Measured, like the analysis, on what the congregation keeps
export function planSummary(plan: Plan, site: Site): PlanSummary {
	const dev = developmentType(plan);
	const bt = buildingType(plan, site);
	const cell = siteCell(site, plan);
	const kept = keptPlan(plan);
	const byStatus = dwellingsByStatus(kept);
	return {
		developmentType: dev ? DEVELOPMENT_TYPE_LABELS[dev] : '',
		buildingType: bt ? BUILDING_TYPE_LABELS[bt] : '',
		cell: isComplete(cell) ? cellLabel(cell) : '',
		gfa: grossFloorArea(kept),
		footprint: siteFootprint(kept),
		coverage: lotCoverage(plan, site),
		reuse: reuseFloorArea(kept),
		units: dwellingsEstimate(kept),
		unitsReuse: byStatus.adaptive_reuse,
		unitsNew: byStatus.new,
		green: greenSpaceArea(kept),
		parking: parkingArea(kept),
		sale: saleArea(plan),
		uses: useFloorAreaByUse(kept),
	};
}

export interface CompareRow {
	label: string;
	a: string;
	b: string;
	change: string; // "+1,200 sq ft", "▲ 4", or "" when unchanged or not a number
	changed: boolean;
	short: boolean; // shown in the strip as well as the analysis
}

const sqft = (m2: number) => Math.round(sqmToSqft(m2));
const fmt = (n: number) => n.toLocaleString('en-US');
const signed = (n: number, unit = '') => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}${unit}`;

function words(label: string, a: string, b: string, short: boolean): CompareRow {
	return { label, a: a || '—', b: b || '—', change: '', changed: a !== b, short };
}

function number(label: string, a: number, b: number, unit: '' | ' sq ft' | '%', short: boolean): CompareRow {
	const d = b - a;
	return { label, a: fmt(a) + unit, b: fmt(b) + unit, change: d ? signed(d, unit === '%' ? ' pts' : unit) : '', changed: d !== 0, short };
}

// The rows of the comparison, in the analysis's order; areas rounded to whole square feet,
// so a change smaller than that doesn't count
export function compareRows(a: PlanSummary, b: PlanSummary): CompareRow[] {
	const pct = (v: number | null) => (v === null ? null : Math.round(v));
	const rows: CompareRow[] = [
		words('Development type', a.developmentType, b.developmentType, true),
		words('Building type', a.buildingType, b.buildingType, true),
		words('Pattern cell', a.cell, b.cell, false),
		number('Gross floor area', sqft(a.gfa), sqft(b.gfa), ' sq ft', true),
		number('Footprint', sqft(a.footprint), sqft(b.footprint), ' sq ft', false),
	];
	const [ca, cb] = [pct(a.coverage), pct(b.coverage)];
	if (ca !== null && cb !== null) rows.push(number('Lot coverage', ca, cb, '%', true));
	rows.push(
		number('Adaptive reuse', sqft(a.reuse), sqft(b.reuse), ' sq ft', true),
		number('Housing units', a.units, b.units, '', true),
		number('Units by reuse', a.unitsReuse, b.unitsReuse, '', false),
		number('New units', a.unitsNew, b.unitsNew, '', false),
		number('Green space', sqft(a.green), sqft(b.green), ' sq ft', true),
		number('Parking', sqft(a.parking), sqft(b.parking), ' sq ft', true),
	);
	// Only when either plan sells land
	if (a.sale || b.sale) rows.push(number('Land to sell', sqft(a.sale), sqft(b.sale), ' sq ft', true));
	return rows;
}
