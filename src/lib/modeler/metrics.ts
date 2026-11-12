import type { OpenSpace, Part, Plan, Site, Structure, Use } from './types';

export function partFootprint(part: Part): number {
	if (part.shape === 'poly' && part.points) return polygonArea(part.points) * part.w * part.d;
	return part.w * part.d;
}

// Sum of part footprints (overlaps not subtracted)
export function structureFootprint(structure: Structure): number {
	return structure.parts.reduce((sum, p) => sum + partFootprint(p), 0);
}

export function siteFootprint(plan: Plan): number {
	return plan.structures.reduce((sum, s) => sum + structureFootprint(s), 0);
}

export function grossFloorArea(plan: Plan): number {
	return plan.structures.reduce(
		(sum, s) => sum + structureFootprint(s) * (s.stories + (s.basement ? 1 : 0)),
		0,
	);
}

// Polygon area via shoelace formula (meters²)
export function polygonArea(polygon: [number, number][]): number {
	const n = polygon.length;
	if (n < 3) return 0;
	let area = 0;
	for (let i = 0; i < n; i++) {
		const [x1, y1] = polygon[i];
		const [x2, y2] = polygon[(i + 1) % n];
		area += x1 * y2 - x2 * y1;
	}
	return Math.abs(area) / 2;
}

export function openSpaceAreaByKind(plan: Plan): Partial<Record<OpenSpace['kind'], number>> {
	const result: Partial<Record<OpenSpace['kind'], number>> = {};
	for (const os of plan.openSpaces) {
		result[os.kind] = (result[os.kind] ?? 0) + polygonArea(os.polygon);
	}
	return result;
}

export function openSpaceArea(plan: Plan): number {
	return plan.openSpaces.reduce((sum, os) => sum + polygonArea(os.polygon), 0);
}

export function parkingArea(plan: Plan): number {
	return plan.openSpaces
		.filter((os) => os.kind === 'parking')
		.reduce((sum, os) => sum + polygonArea(os.polygon), 0);
}

const GREEN_KINDS: OpenSpace['kind'][] = ['lawn', 'garden', 'courtyard', 'cemetery'];

export function greenSpaceArea(plan: Plan): number {
	return plan.openSpaces
		.filter((os) => GREEN_KINDS.includes(os.kind))
		.reduce((sum, os) => sum + polygonArea(os.polygon), 0);
}

// Returns footprint as a percentage of parcel area, or null if no parcel defined
export function lotCoverage(plan: Plan, site: Site): number | null {
	if (!site.parcel || site.parcel.length < 3) return null;
	const parcel = polygonArea(site.parcel);
	if (parcel === 0) return null;
	return (siteFootprint(plan) / parcel) * 100;
}

export function dwellingsEstimate(plan: Plan): number {
	return plan.structures.reduce((sum, s) => sum + (s.dwellings ?? 0), 0);
}

export function dwellingsByStatus(plan: Plan): { adaptive_reuse: number; new: number; existing: number } {
	const result = { adaptive_reuse: 0, new: 0, existing: 0 };
	for (const s of plan.structures) {
		if (!s.uses.includes('housing') || !s.dwellings) continue;
		if (s.status === 'adaptive_reuse') result.adaptive_reuse += s.dwellings;
		else if (s.status === 'new') result.new += s.dwellings;
		else if (s.status === 'existing') result.existing += s.dwellings;
	}
	return result;
}

// GFA × normalized use weight, summed across all structures
export function useFloorAreaByUse(plan: Plan): Partial<Record<Use, number>> {
	const result: Partial<Record<Use, number>> = {};
	for (const s of plan.structures) {
		if (s.uses.length === 0) continue;
		const gfa = structureFootprint(s) * s.stories;
		const totalWeight = s.uses.reduce((sum, u) => sum + (s.useWeights?.[u] ?? 50), 0);
		if (totalWeight === 0) continue;
		for (const u of s.uses) {
			const share = (s.useWeights?.[u] ?? 50) / totalWeight;
			result[u] = (result[u] ?? 0) + gfa * share;
		}
	}
	return result;
}

export interface ActionStep {
	category: 'land-use' | 'green-space' | 'program' | 'density' | 'pattern';
	message: string;
	severity: 'info' | 'suggest' | 'flag';
}

export function generateActionSteps(plan: Plan, site: Site): ActionStep[] {
	const steps: ActionStep[] = [];
	const footprint = siteFootprint(plan);
	const coverage = lotCoverage(plan, site);
	const green = greenSpaceArea(plan);
	const parking = parkingArea(plan);
	const osArea = openSpaceArea(plan);

	if (coverage !== null && coverage > 60) {
		steps.push({
			category: 'density',
			message: 'High lot coverage — consider additional stories to increase GFA without expanding the footprint.',
			severity: 'suggest',
		});
	}

	if (green === 0 && footprint > 0) {
		steps.push({
			category: 'green-space',
			message: 'No green space identified — lawn, garden, or courtyard can improve site quality.',
			severity: 'flag',
		});
	} else if (green > 0 && parking > green) {
		steps.push({
			category: 'green-space',
			message: 'Parking dominates open space — consider reducing surface parking in favor of green space.',
			severity: 'suggest',
		});
	}

	if (
		site.siteType === 'urban' &&
		plan.structures.length > 0 &&
		plan.structures.every((s) => s.uses.length === 1 && s.uses[0] === 'worship')
	) {
		steps.push({
			category: 'program',
			message: 'Single-use worship site — fellowship, education, or community uses increase neighborhood engagement.',
			severity: 'suggest',
		});
	}

	if (plan.structures.length > 0 && plan.structures.every((s) => s.status === 'existing')) {
		steps.push({
			category: 'pattern',
			message: 'No new construction or adaptive reuse proposed — consider opportunities for change.',
			severity: 'info',
		});
	}

	if (
		site.siteType === 'urban' &&
		plan.structures.length > 0 &&
		plan.structures.every((s) => s.stories === 1)
	) {
		steps.push({
			category: 'density',
			message: 'Urban site with all single-story buildings — additional stories could increase gross floor area.',
			severity: 'suggest',
		});
	}

	const hasHousingUse = plan.structures.some((s) => s.uses.includes('housing'));
	const hasDwellings = plan.structures.some((s) => (s.dwellings ?? 0) > 0);
	if (hasHousingUse && !hasDwellings) {
		steps.push({
			category: 'program',
			message: 'Housing use is selected but dwelling count is unset — add an estimate to enable density metrics.',
			severity: 'flag',
		});
	}

	if (osArea === 0 && footprint > 0) {
		steps.push({
			category: 'land-use',
			message: 'No open spaces drawn — add parking, lawn, or walkway areas for a complete site picture.',
			severity: 'info',
		});
	}

	return steps;
}
