import { describe, it, expect } from 'vitest';
import { clipToPart, fromPartPoints, toPartPoints, wholePartZone, zoneOutline, zonesForPolygon } from './geo';
import {
	dwellingsByStatus,
	dwellingsEstimate,
	generateActionSteps,
	polygonArea,
	reuseZoneCount,
	useFloorAreaByUse,
	zoneDwellings,
	zoneFloorArea,
} from './metrics';
import type { Part, Plan, ReuseZone, Site, Structure } from './types';

type Pt = [number, number];

const part = (overrides: Partial<Part> = {}): Part => ({ id: 'a', shape: 'rect', x: 10, y: -5, w: 20, d: 10, rotation: 30, ...overrides });

function structure(overrides: Partial<Structure> = {}): Structure {
	return {
		id: 's', label: 'S', status: 'existing', uses: [], stories: 3, floorHeight: 3.5, roof: 'flat',
		parts: [part()], provenance: 'user', ...overrides,
	};
}

const plan = (structures: Structure[]): Plan => ({ id: 'p', name: 'P', slug: 'p', structures, openSpaces: [], trees: [], annotations: [] });

// The west half of the part, in its own frame
const westHalf: Pt[] = [[-0.5, -0.5], [0, -0.5], [0, 0.5], [-0.5, 0.5]];
const zone = (overrides: Partial<ReuseZone> = {}): ReuseZone => ({ id: 'z', partId: 'a', points: westHalf, floors: [2, 2], use: 'housing', ...overrides });

describe('part frame', () => {
	it('round trips site points through a rotated part', () => {
		const p = part();
		const site: Pt[] = [[12, -3], [0, 0], [25, 4]];
		const back = fromPartPoints(toPartPoints(site, p), p);
		back.forEach(([x, y], i) => {
			expect(x).toBeCloseTo(site[i][0]);
			expect(y).toBeCloseTo(site[i][1]);
		});
	});

	it('follows the part when it moves, turns or grows', () => {
		const p = part();
		const before = polygonArea(zoneOutline(zone(), p));
		expect(before).toBeCloseTo(100); // half of 20 x 10
		const moved = zoneOutline(zone(), { ...p, x: 100, rotation: 75, w: 40 });
		expect(polygonArea(moved)).toBeCloseTo(200); // twice as wide, still half
	});
});

describe('zone geometry', () => {
	it('covers a whole part', () => {
		const p = part();
		expect(polygonArea(zoneOutline({ points: wholePartZone(p) }, p))).toBeCloseTo(200);
	});

	it('clips a drawn area to each part it overlaps', () => {
		const left = part({ id: 'L', x: -10, y: 0, rotation: 0 }); // x -20..0
		const right = part({ id: 'R', x: 10, y: 0, rotation: 0 }); // x 0..20
		const drawn: Pt[] = [[-5, -20], [5, -20], [5, 20], [-5, 20]]; // straddles the seam, overhangs both sides
		const zones = zonesForPolygon(drawn, [left, right]);
		expect(zones.map((z) => z.partId)).toEqual(['L', 'R']);
		for (const z of zones) {
			const p = z.partId === 'L' ? left : right;
			expect(polygonArea(zoneOutline(z, p))).toBeCloseTo(50); // 5 x 10 inside each part
		}
	});

	it('drops areas that miss the part', () => {
		expect(clipToPart([[100, 100], [110, 100], [110, 110]], part())).toEqual([]);
	});
});

describe('zone metrics', () => {
	it('counts floor area on every floor in the range', () => {
		expect(zoneFloorArea(zone({ floors: [1, 3] }), structure())).toBeCloseTo(300);
		expect(zoneFloorArea(zone({ floors: [2, 2] }), structure())).toBeCloseTo(100);
	});

	it('estimates housing units from area unless entered', () => {
		// 100 m² = 1,076 sq ft: one 900 sq ft unit
		expect(zoneDwellings(zone(), structure())).toBe(1);
		expect(zoneDwellings(zone({ floors: [1, 3] }), structure())).toBe(3);
		expect(zoneDwellings(zone({ dwellings: 8 }), structure())).toBe(8);
		expect(zoneDwellings(zone({ use: 'community' }), structure())).toBe(0);
	});

	it('reports reuse units separately from existing and new', () => {
		const church = structure({ uses: ['housing'], dwellings: 2, reuseZones: [zone({ floors: [1, 3] })] });
		const infill = structure({ id: 'n', status: 'new', uses: ['housing'], dwellings: 12 });
		const p = plan([church, infill]);
		expect(dwellingsByStatus(p)).toEqual({ existing: 2, adaptive_reuse: 3, new: 12 });
		expect(dwellingsEstimate(p)).toBe(17);
		expect(reuseZoneCount(p)).toBe(1);
	});

	it('carves zones out of the building so floor area is not counted twice', () => {
		// 200 m² footprint x 3 stories = 600 m²; a 100 m² housing zone on floor 2
		const s = structure({ uses: ['worship', 'education'], useWeights: { worship: 50, education: 50 }, reuseZones: [zone()] });
		const areas = useFloorAreaByUse(plan([s]));
		expect(areas.housing).toBeCloseTo(100);
		expect(areas.worship).toBeCloseTo(250);
		expect(areas.education).toBeCloseTo(250);
		expect(Object.values(areas).reduce((a, b) => a + b!, 0)).toBeCloseTo(600);
	});

	it('counts housing reuse zones toward a structure that lists housing', () => {
		const site = { id: 's', name: 'S', mode: 'grid', context: { buildings: [], roads: [] }, plans: [] } as Site;
		const flagged = (structures: Structure[]) =>
			generateActionSteps(plan(structures), site).find((s) => s.message.includes('without a unit count'))?.message;
		// Housing listed, no units anywhere: flagged by name
		expect(flagged([structure({ label: 'Hall', uses: ['housing'] })])).toBe(
			'Hall lists housing without a unit count. Add an estimate, or a housing reuse zone, to enable density metrics.',
		);
		// The reported case: no units on the structure, 6 in its zone
		expect(flagged([structure({ uses: ['housing'], reuseZones: [zone({ dwellings: 6 })] })])).toBeUndefined();
		// A zone estimate counts too (100 m² on 3 floors: 3 units)
		expect(flagged([structure({ uses: ['housing'], reuseZones: [zone({ floors: [1, 3] })] })])).toBeUndefined();
		// A non-housing zone doesn't
		expect(flagged([structure({ label: 'Hall', uses: ['housing'], reuseZones: [zone({ use: 'community' })] })])).toMatch(/^Hall lists/);
		expect(flagged([structure({ uses: ['housing'] }), structure({ id: 't', uses: ['housing'] })])).toMatch(/^2 structures list/);
	});

	it('does not suggest change when reuse is proposed', () => {
		const site = { id: 's', name: 'S', mode: 'grid', context: { buildings: [], roads: [] }, plans: [] } as Site;
		const message = 'No new construction or adaptive reuse proposed';
		const unchanged = generateActionSteps(plan([structure()]), site);
		expect(unchanged.some((s) => s.message.startsWith(message))).toBe(true);
		const reused = generateActionSteps(plan([structure({ reuseZones: [zone()] })]), site);
		expect(reused.some((s) => s.message.startsWith(message))).toBe(false);
	});
});
