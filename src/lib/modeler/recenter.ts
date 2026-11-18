import { CONTEXT_HALF_SIZE, boardHalfFor, polygonCentroid, toLatLng } from './geo';
import type { Plan, Site, SiteContext } from './types';

type Pt = [number, number];

// The board is centered on the site's origin, which starts as the address point. On a big
// campus that can be at the street, far from the buildings, and pan stops at the board's edge,
// so the property can't be brought to the middle. Once there's a parcel, the origin moves to
// its center and everything shifts with it; the neighborhood is then reloaded around it.

const RECENTER_MIN = 40; // m: a parcel's center farther than this from the origin moves the board

// The middle of the parcel's bounding box, which is what a fitted view centers on
export function parcelCenter(parcel: Pt[]): Pt {
	const xs = parcel.map(([x]) => x);
	const ys = parcel.map(([, y]) => y);
	return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

// How far to move the origin, or null if the parcel is already about centered
export function recenterOffset(parcel: Pt[] | undefined): Pt | null {
	if (!parcel?.length) return null;
	const c = parcelCenter(parcel);
	return Math.hypot(c[0], c[1]) > RECENTER_MIN ? c : null;
}

const shift = ([x, y]: Pt, [dx, dy]: Pt): Pt => [x - dx, y - dy];

function shiftPlan(plan: Plan, d: Pt): Plan {
	return {
		...plan,
		// Parts are placed by their centers; outlines, zones and roofs are relative to the part
		structures: plan.structures.map((s) => ({ ...s, parts: s.parts.map((p) => ({ ...p, x: p.x - d[0], y: p.y - d[1] })) })),
		openSpaces: plan.openSpaces.map((os) => ({ ...os, polygon: os.polygon.map((p) => shift(p, d)) })),
		trees: plan.trees.map((t) => ({ ...t, x: t.x - d[0], y: t.y - d[1] })),
		annotations: plan.annotations.map((a) => ({ ...a, x: a.x - d[0], y: a.y - d[1] })),
	};
}

export function shiftContext(context: SiteContext, d: Pt): SiteContext {
	return {
		...context,
		buildings: context.buildings.map((b) => ({ ...b, polygon: b.polygon.map((p) => shift(p, d)) })),
		roads: context.roads.map((r) => ({ ...r, line: r.line.map((p) => shift(p, d)) })),
		terrain: undefined, // a grid around the old origin: reloaded around the new one
	};
}

// The site with its origin moved `d` meters (site coordinates) and every position shifted to
// match, so nothing moves on the ground. The board keeps its size until it's reloaded.
export function shiftSite(site: Site, d: Pt): Site {
	if (!site.origin) return site;
	return {
		...site,
		origin: toLatLng(d[0], d[1], site.origin),
		parcel: site.parcel?.map((p) => shift(p, d)),
		context: shiftContext(site.context, d),
		existing: shiftPlan(site.existing, d),
		plans: site.plans.map((p) => shiftPlan(p, d)),
	};
}

// The board a centered parcel needs: the default, or bigger for a big parcel
export function centeredBoardHalf(parcel: Pt[]): number {
	return boardHalfFor(parcel, CONTEXT_HALF_SIZE) ?? CONTEXT_HALF_SIZE;
}

// A reloaded board's buildings: the old board's where they were (the parcel's own left the foam
// when they became chipboard, and must not come back), within the new board, plus the fetched
// ones off the old board. The old board was centered at `oldCenter` in the new coordinates.
export function reloadedBuildings<B extends { polygon: Pt[] }>(old: B[], oldHalf: number, oldCenter: Pt, half: number, fetched: B[]): B[] {
	const within = (b: B, [cx, cy]: Pt, h: number) => {
		const [x, y] = polygonCentroid(b.polygon);
		return Math.abs(x - cx) <= h && Math.abs(y - cy) <= h;
	};
	return [...old.filter((b) => within(b, [0, 0], half)), ...fetched.filter((b) => !within(b, oldCenter, oldHalf))];
}
