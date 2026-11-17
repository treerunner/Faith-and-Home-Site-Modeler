import type { BuildingType, DevelopmentType, OpenSpace, Part, Plan, ReuseZone, Site, Structure, Use } from './types';
import { partOutline, pointInPolygon, polygonCentroid, polygonDistance, zoneOutline } from './geo';
import { AVG_UNIT_SQFT, sqmToSqft } from './units';
import { addedStories, totalStories } from './geometry';

export function partFootprint(part: Part): number {
	if (part.shape === 'poly' && part.points) return polygonArea(part.points) * part.w * part.d;
	return part.w * part.d;
}

// Sum of part footprints (overlaps not subtracted)
export function structureFootprint(structure: Structure): number {
	return structure.parts.reduce((sum, p) => sum + partFootprint(p), 0);
}

// Ground the buildings take; rooftop pieces take none
export function siteFootprint(plan: Plan): number {
	return plan.structures.reduce((sum, s) => sum + (s.onRoofOf ? 0 : structureFootprint(s)), 0);
}

// Every floor of every building, with the floors reuse zones add on top
export function grossFloorArea(plan: Plan): number {
	return plan.structures.reduce(
		(sum, s) => sum + structureFootprint(s) * (totalStories(s) + (s.basement ? 1 : 0)) + zoneAdditions(s),
		0,
	);
}

// Floor area reuse zones add above a building's roof
function zoneAdditions(s: Structure): number {
	return (s.reuseZones ?? []).reduce((sum, z) => {
		const part = s.parts.find((p) => p.id === z.partId);
		return sum + (part ? polygonArea(zoneOutline(z, part)) * (z.addedStories ?? 0) : 0);
	}, 0);
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

// Land to sell isn't open space: it leaves the property
const openSpacesOf = (plan: Plan) => plan.openSpaces.filter((os) => os.kind !== 'sale');

export function openSpaceAreaByKind(plan: Plan): Partial<Record<OpenSpace['kind'], number>> {
	const result: Partial<Record<OpenSpace['kind'], number>> = {};
	for (const os of openSpacesOf(plan)) {
		result[os.kind] = (result[os.kind] ?? 0) + polygonArea(os.polygon);
	}
	return result;
}

export function openSpaceArea(plan: Plan): number {
	return openSpacesOf(plan).reduce((sum, os) => sum + polygonArea(os.polygon), 0);
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

// Footprint as a percentage of the property, or null if no parcel defined. A plan that sells
// land is measured on what it keeps: its kept buildings over the parcel less the land to sell.
export function lotCoverage(plan: Plan, site: Site): number | null {
	if (!site.parcel || site.parcel.length < 3) return null;
	const parcel = polygonArea(site.parcel) - saleArea(plan);
	if (parcel <= 0) return null;
	return (siteFootprint(keptPlan(plan)) / parcel) * 100;
}

// ── Land to sell ─────────────────────────────────────────────────────────────

export function saleAreas(plan: Plan): OpenSpace[] {
	return plan.openSpaces.filter((os) => os.kind === 'sale');
}

// m² of land the plan proposes to sell
export function saleArea(plan: Plan): number {
	return saleAreas(plan).reduce((sum, os) => sum + polygonArea(os.polygon), 0);
}

// The buildings sold with the land: a building (its touching pieces, rooftop pieces included)
// whose area-weighted center lies on land to sell. Buildings to be removed aren't sold.
export function soldStructures(plan: Plan): Set<string> {
	const areas = saleAreas(plan);
	const sold = new Set<string>();
	if (!areas.length) return sold;
	for (const building of planBuildings(plan)) {
		const ground = building.filter((s) => !s.onRoofOf);
		let x = 0, y = 0, total = 0;
		for (const p of (ground.length ? ground : building).flatMap((s) => s.parts)) {
			const a = partFootprint(p);
			x += p.x * a;
			y += p.y * a;
			total += a;
		}
		if (total === 0) continue;
		const center: [number, number] = [x / total, y / total];
		if (areas.some((os) => pointInPolygon(center, os.polygon))) for (const s of building) sold.add(s.id);
	}
	return sold;
}

// What the congregation keeps: the plan without the land to sell and what's on it (buildings,
// and open spaces whose center is on it, like a parking lot sold). The analysis, compare and
// building type measure this.
export function keptPlan(plan: Plan): Plan {
	const areas = saleAreas(plan);
	if (!areas.length) return plan;
	const sold = soldStructures(plan);
	const onSoldLand = (os: OpenSpace) => areas.some((a) => pointInPolygon(polygonCentroid(os.polygon), a.polygon));
	return {
		...plan,
		structures: plan.structures.filter((s) => !sold.has(s.id)),
		openSpaces: openSpacesOf(plan).filter((os) => !onSoldLand(os)),
	};
}

// ── Reuse zones ──────────────────────────────────────────────────────────────

// A zone's floor area, split by how it comes about. A building's floors are one stack: its own
// stories, then any stories a plan adds to the whole building, then the zone's own added stories
// on top. On its own floors the zone is adaptive reuse; on added floors it is new construction
// with the zone's use.
export function zoneAreas(zone: ReuseZone, structure: Structure): { reuse: number; new: number } {
	const part = structure.parts.find((p) => p.id === zone.partId);
	if (!part) return { reuse: 0, new: 0 };
	const area = polygonArea(zoneOutline(zone, part));
	const [from, to] = zone.floors;
	const own = Math.max(0, Math.min(to, structure.stories) - from + 1);
	const added = to - from + 1 - own + (zone.addedStories ?? 0);
	return { reuse: area * own, new: area * added };
}

// Floor area of a reuse zone: its outline on every floor in its range, and on any it adds
export function zoneFloorArea(zone: ReuseZone, structure: Structure): number {
	const { reuse, new: added } = zoneAreas(zone, structure);
	return reuse + added;
}

// Housing units in a zone: the entered count, or an estimate from its area
export function zoneDwellings(zone: ReuseZone, structure: Structure): number {
	if (zone.use !== 'housing') return 0;
	return zone.dwellings ?? Math.floor(sqmToSqft(zoneFloorArea(zone, structure)) / AVG_UNIT_SQFT);
}

const zonesOf = (plan: Plan) => plan.structures.flatMap((s) => (s.reuseZones ?? []).map((z) => ({ z, s })));

// ── Use shares ───────────────────────────────────────────────────────────────

// A building's mix of uses: a plan's own for a site piece, else the site's
export function programOf(s: Structure): { uses: Use[]; weights: Partial<Record<Use, number>> } {
	return s.planUses ? { uses: s.planUses, weights: s.planUseWeights ?? {} } : { uses: s.uses, weights: s.useWeights ?? {} };
}

// Each use's share of a mix, 0..1
export function useShares(uses: Use[], weights: Partial<Record<Use, number>>): Partial<Record<Use, number>> {
	const total = uses.reduce((sum, u) => sum + (weights[u] ?? 50), 0);
	const out: Partial<Record<Use, number>> = {};
	if (total > 0) for (const u of uses) out[u] = (weights[u] ?? 50) / total;
	return out;
}

// Two mixes are the same when they hold the same uses in the same shares
export function sameMix(
	a: { uses: Use[]; weights: Partial<Record<Use, number>> },
	b: { uses: Use[]; weights: Partial<Record<Use, number>> },
): boolean {
	if (a.uses.length !== b.uses.length || a.uses.some((u) => !b.uses.includes(u))) return false;
	const [sa, sb] = [useShares(a.uses, a.weights), useShares(b.uses, b.weights)];
	return a.uses.every((u) => Math.abs((sa[u] ?? 0) - (sb[u] ?? 0)) < 1e-6);
}

// Floor a building's zones take from its own floors (not what they add above its roof)
function zonedOwnArea(s: Structure): number {
	return (s.reuseZones ?? []).reduce((sum, z) => sum + zoneAreas(z, s).reuse, 0);
}

// Reuse by share: in a plan, what each use gains over the site's mix of a building that stays,
// on the building's own floors after its zones. Floors the plan adds are new construction.
export function shareReuse(s: Structure): Partial<Record<Use, number>> {
	if (!s.planUses || s.status !== 'existing') return {};
	const own = Math.max(0, structureFootprint(s) * (s.stories + (s.basement ? 1 : 0)) - zonedOwnArea(s));
	const site = useShares(s.uses, s.useWeights ?? {});
	const plan = useShares(s.planUses, s.planUseWeights ?? {});
	const out: Partial<Record<Use, number>> = {};
	for (const u of s.planUses) {
		const gain = (plan[u] ?? 0) - (site[u] ?? 0);
		if (gain > 1e-9) out[u] = gain * own;
	}
	return out;
}

const sum = (r: Partial<Record<Use, number>>) => Object.values(r).reduce((a, b) => a + (b ?? 0), 0);

// Units in the housing a building gains by share
export function shareDwellings(s: Structure): number {
	return Math.floor(sqmToSqft(shareReuse(s).housing ?? 0) / AVG_UNIT_SQFT);
}

// Adaptive reuse floor area: reuse zones on buildings' own floors, plus reuse by share
export function reuseFloorArea(plan: Plan): number {
	return plan.structures.reduce(
		(total, s) => total + (s.reuseZones ?? []).reduce((a, z) => a + zoneAreas(z, s).reuse, 0) + sum(shareReuse(s)),
		0,
	);
}

export function reuseZoneCount(plan: Plan): number {
	return zonesOf(plan).length;
}

export function dwellingsEstimate(plan: Plan): number {
	const structures = plan.structures.reduce((sum, s) => sum + (s.dwellings ?? 0) + shareDwellings(s), 0);
	return structures + zonesOf(plan).reduce((sum, { z, s }) => sum + zoneDwellings(z, s), 0);
}

// Units by how they come about: in buildings as they stand, in reuse zones, in new buildings
export function dwellingsByStatus(plan: Plan): { adaptive_reuse: number; new: number; existing: number } {
	const result = { adaptive_reuse: 0, new: 0, existing: 0 };
	for (const s of plan.structures) {
		result.adaptive_reuse += shareDwellings(s);
		if (!s.uses.includes('housing') || !s.dwellings) continue;
		if (s.status === 'new') result.new += s.dwellings;
		else if (s.status === 'existing') result.existing += s.dwellings;
	}
	// A zone's units split between reuse and new as its floor area does
	for (const { z, s } of zonesOf(plan)) {
		const units = zoneDwellings(z, s);
		const { reuse, new: added } = zoneAreas(z, s);
		const reused = reuse + added > 0 ? Math.round((units * reuse) / (reuse + added)) : 0;
		result.adaptive_reuse += reused;
		result.new += units - reused;
	}
	return result;
}

// Floor area by use. Reuse zones count toward their own use; the structure's use sliders
// (its current program) share out the rest of its floor area, so nothing is counted twice.
export function useFloorAreaByUse(plan: Plan): Partial<Record<Use, number>> {
	const result: Partial<Record<Use, number>> = {};
	const add = (u: Use, area: number) => (result[u] = (result[u] ?? 0) + area);
	for (const s of plan.structures) {
		const zones = s.reuseZones ?? [];
		let zoned = 0;
		for (const z of zones) {
			const area = zoneFloorArea(z, s);
			add(z.use, area);
			// Its floors within the building come out of the building's program; what it adds on top doesn't
			const part = s.parts.find((p) => p.id === z.partId);
			zoned += area - (part ? polygonArea(zoneOutline(z, part)) * (z.addedStories ?? 0) : 0);
		}
		// Added stories take the building's program, like its other floors; a plan's mix of uses
		// shares out the building in that plan
		const { uses, weights } = programOf(s);
		const remaining = Math.max(0, structureFootprint(s) * totalStories(s) - zoned);
		const shares = useShares(uses, weights);
		for (const u of uses) add(u, remaining * (shares[u] ?? 0));
	}
	return result;
}

export interface ActionStep {
	category: 'land-use' | 'green-space' | 'program' | 'density' | 'pattern';
	message: string;
	severity: 'info' | 'suggest' | 'flag';
}

export function generateActionSteps(whole: Plan, site: Site): ActionStep[] {
	const steps: ActionStep[] = [];
	// What the congregation keeps; coverage is on the land kept
	const plan = keptPlan(whole);
	const footprint = siteFootprint(plan);
	const coverage = lotCoverage(whole, site);
	const green = greenSpaceArea(plan);
	const parking = parkingArea(plan);
	const osArea = openSpaceArea(plan);

	if (coverage !== null && coverage > 60) {
		steps.push({
			category: 'density',
			message: 'High lot coverage. Consider additional stories to increase GFA without expanding the footprint.',
			severity: 'suggest',
		});
	}

	if (green === 0 && footprint > 0) {
		steps.push({
			category: 'green-space',
			message: 'No green space identified. Lawn, garden, or courtyard can improve site quality.',
			severity: 'flag',
		});
	} else if (green > 0 && parking > green) {
		steps.push({
			category: 'green-space',
			message: 'Parking dominates open space. Consider reducing surface parking in favor of green space.',
			severity: 'suggest',
		});
	}

	if (
		site.siteType === 'urban' &&
		plan.structures.length > 0 &&
		plan.structures.every((s) => programOf(s).uses.join() === 'worship')
	) {
		steps.push({
			category: 'program',
			message: 'Single-use worship site. Fellowship, education, or community uses increase neighborhood engagement.',
			severity: 'suggest',
		});
	}

	if (plan.structures.length > 0 && plan.structures.every((s) => s.status === 'existing') && reuseZoneCount(plan) === 0 && reuseFloorArea(plan) === 0) {
		steps.push({
			category: 'pattern',
			message: 'No new construction or adaptive reuse proposed. Consider opportunities for change.',
			severity: 'info',
		});
	}

	if (
		site.siteType === 'urban' &&
		plan.structures.length > 0 &&
		plan.structures.every((s) => totalStories(s) === 1)
	) {
		steps.push({
			category: 'density',
			message: 'Urban site with all single-story buildings. Additional stories could increase gross floor area.',
			severity: 'suggest',
		});
	}

	// A structure that lists housing is counted when it has units of its own or a housing reuse
	// zone with units (entered or estimated from area)
	const uncounted = plan.structures.filter(
		(s) =>
			programOf(s).uses.includes('housing') &&
			!(s.dwellings && s.dwellings > 0) &&
			!(s.reuseZones ?? []).some((z) => zoneDwellings(z, s) > 0) &&
			!(shareDwellings(s) > 0),
	);
	if (uncounted.length) {
		const which = uncounted.length === 1 ? uncounted[0].label || 'A structure' : `${uncounted.length} structures`;
		steps.push({
			category: 'program',
			message: `${which} ${uncounted.length === 1 ? 'lists' : 'list'} housing without a unit count. Add an estimate, or a housing reuse zone, to enable density metrics.`,
			severity: 'flag',
		});
	}

	if (osArea === 0 && footprint > 0) {
		steps.push({
			category: 'land-use',
			message: 'No open spaces drawn. Add parking, lawn, or walkway areas for a complete site picture.',
			severity: 'info',
		});
	}

	return steps;
}

// ── Building type ────────────────────────────────────────────────────────────
// Pattern-book types: Box (one simple building), Box-Plus (one building of several touching
// pieces), Object (a radial or triangular "object in space" church), Cluster (several
// buildings near each other). The distinctions are loose; these thresholds are for the team
// to tune.

const TOUCH_TOLERANCE = 0.5; // m: pieces this close count as one building
const MIN_CLUSTER_BUILDING = 25; // m²: smaller outbuildings (sheds) don't make a cluster
const CLUSTER_DISTANCE = 50; // m from the main building, outline to outline

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
	box: 'Box',
	box_plus: 'Box-Plus',
	object: 'Object',
	cluster: 'Cluster',
};

const outlines = (structures: Structure[]) => structures.flatMap((s) => s.parts.map(partOutline));

function buildingDistance(a: Structure[], b: Structure[]): number {
	let best = Infinity;
	for (const pa of outlines(a)) for (const pb of outlines(b)) best = Math.min(best, polygonDistance(pa, pb));
	return best;
}

// Structures joined into buildings: the same group, or footprints that touch. Removed
// structures are left out (they are going away).
export function planBuildings(plan: Plan): Structure[][] {
	const structures = plan.structures.filter((s) => s.status !== 'removed' && s.parts.length > 0);
	const parent = structures.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	for (let i = 0; i < structures.length; i++) {
		for (let j = i + 1; j < structures.length; j++) {
			const a = structures[i];
			const b = structures[j];
			const joined =
				(a.groupId && a.groupId === b.groupId) || a.onRoofOf === b.id || b.onRoofOf === a.id || buildingDistance([a], [b]) <= TOUCH_TOLERANCE;
			if (joined) parent[find(i)] = find(j);
		}
	}
	const buildings = new Map<number, Structure[]>();
	structures.forEach((s, i) => buildings.set(find(i), [...(buildings.get(find(i)) ?? []), s]));
	return [...buildings.values()];
}

// Order: Cluster, then Object, then Box-Plus, then Box. A cluster stays a cluster whatever its
// main building looks like. The main building is an Object when the site says it has no clear
// front (or several), or when it has a triangle or circle piece.
export function inferBuildingType(plan: Plan, site?: Pick<Site, 'mainBuildingFront'>): BuildingType | null {
	// What the congregation keeps: buildings sold with the land don't count
	const buildings = planBuildings(keptPlan(plan));
	if (buildings.length === 0) return null;
	// What stands on the ground decides: a drum or cupola on the roof doesn't make an Object or a Box-Plus
	const grounded = (b: Structure[]) => b.filter((s) => !s.onRoofOf);
	const area = (b: Structure[]) => grounded(b).reduce((sum, s) => sum + structureFootprint(s), 0);
	const [main, ...others] = [...buildings].sort((a, b) => area(b) - area(a));
	const nearby = others.filter((b) => area(b) >= MIN_CLUSTER_BUILDING && buildingDistance(main, b) <= CLUSTER_DISTANCE);
	if (nearby.length >= 2) return 'cluster';
	if (site?.mainBuildingFront === 'none' || site?.mainBuildingFront === 'several') return 'object';
	const parts = grounded(main).flatMap((s) => s.parts);
	if (parts.some((p) => p.shape === 'tri' || p.shape === 'circle')) return 'object';
	if (parts.length >= 2) return 'box_plus';
	return 'box';
}

export function buildingType(plan: Plan, site?: Pick<Site, 'mainBuildingFront'>): BuildingType | null {
	return plan.buildingTypeOverride ?? inferBuildingType(plan, site);
}

// ── Development type ─────────────────────────────────────────────────────────

export const DEVELOPMENT_TYPE_LABELS: Record<DevelopmentType, string> = {
	existing: 'Existing conditions',
	reuse: 'Adaptive reuse',
	new: 'New development',
	reuse_new: 'Reuse + new',
	downsize_sell: 'Downsize / sell',
};

// What the plan does, read from the model: reuse zones are adaptive reuse, New structures and
// stories added to existing buildings are new development, removing buildings without adding any is downsizing. Selling land doesn't
// show in a model, so that comes from the override.
export function inferDevelopmentType(plan: Plan): DevelopmentType | null {
	if (plan.structures.length === 0) return null;
	// Reuse and new construction count on the land the congregation keeps; land to sell with
	// nothing else proposed is downsizing
	const kept = keptPlan(plan);
	const areas = zonesOf(kept).map(({ z, s }) => zoneAreas(z, s));
	const reuse = areas.some((a) => a.reuse > 0) || kept.structures.some((s) => sum(shareReuse(s)) > 0);
	const added = kept.structures.some((s) => s.status === 'new' || addedStories(s) > 0) || areas.some((a) => a.new > 0);
	if (reuse && added) return 'reuse_new';
	if (reuse) return 'reuse';
	if (added) return 'new';
	if (saleAreas(plan).length || plan.structures.some((s) => s.status === 'removed')) return 'downsize_sell';
	return 'existing';
}

export function developmentType(plan: Plan): DevelopmentType | null {
	return plan.developmentTypeOverride ?? inferDevelopmentType(plan);
}
