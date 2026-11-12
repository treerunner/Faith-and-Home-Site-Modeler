import { describe, it, expect } from 'vitest';
import {
	polygonArea,
	openSpaceAreaByKind,
	lotCoverage,
	useFloorAreaByUse,
	generateActionSteps,
	greenSpaceArea,
	parkingArea,
} from './metrics';
import type { Plan, Site, Structure, Part } from './types';

function makePart(overrides: Partial<Part> = {}): Part {
	return { id: 'p1', shape: 'rect', x: 0, y: 0, w: 10, d: 5, rotation: 0, ...overrides };
}

function makeStructure(overrides: Partial<Structure> = {}): Structure {
	return {
		id: 's1', label: 'Test', status: 'existing', uses: [], stories: 1,
		floorHeight: 3.5, roof: 'flat', parts: [makePart()], provenance: 'user',
		...overrides,
	};
}

// One site with one plan, flattened: passes as the Plan, and as the Site where a metric needs both.
type SitePlan = Site & Plan;

function makeSite(overrides: Partial<SitePlan> = {}): SitePlan {
	return {
		id: 'site1', name: 'Test Site', mode: 'grid', slug: 'plan', plans: [],
		structures: [], openSpaces: [], trees: [], context: { footprints: [], roads: [] }, annotations: [],
		...overrides,
	};
}

// --- polygonArea ---

describe('polygonArea', () => {
	it('unit square → 1 m²', () => {
		expect(polygonArea([[0,0],[1,0],[1,1],[0,1]])).toBe(1);
	});

	it('10×5 rect → 50 m²', () => {
		expect(polygonArea([[0,0],[10,0],[10,5],[0,5]])).toBe(50);
	});

	it('right triangle with legs 3 and 4 → 6 m²', () => {
		expect(polygonArea([[0,0],[3,0],[0,4]])).toBe(6);
	});

	it('degenerate (< 3 points) → 0', () => {
		expect(polygonArea([[0,0],[1,1]])).toBe(0);
	});
});

// --- openSpaceAreaByKind ---

describe('openSpaceAreaByKind', () => {
	it('sums areas by kind', () => {
		const site = makeSite({
			openSpaces: [
				{ id: 'os1', kind: 'lawn', polygon: [[0,0],[10,0],[10,10],[0,10]] },
				{ id: 'os2', kind: 'parking', polygon: [[0,0],[5,0],[5,4],[0,4]] },
				{ id: 'os3', kind: 'lawn', polygon: [[0,0],[4,0],[4,4],[0,4]] },
			],
		});
		const result = openSpaceAreaByKind(site);
		expect(result.lawn).toBeCloseTo(100 + 16, 1);
		expect(result.parking).toBeCloseTo(20, 1);
	});

	it('empty site → empty object', () => {
		expect(openSpaceAreaByKind(makeSite())).toEqual({});
	});
});

// --- lotCoverage ---

describe('lotCoverage', () => {
	it('returns null when no parcel', () => {
		const site = makeSite({ structures: [makeStructure()] });
		expect(lotCoverage(site, site)).toBeNull();
	});

	it('returns null when parcel has fewer than 3 points', () => {
		const site = makeSite({ parcel: [[0,0],[10,0]], structures: [makeStructure()] });
		expect(lotCoverage(site, site)).toBeNull();
	});

	it('50 m² footprint on 100 m² parcel → 50%', () => {
		const site = makeSite({
			parcel: [[0,0],[10,0],[10,10],[0,10]],
			structures: [makeStructure({ parts: [makePart({ w: 10, d: 5 })] })],
		});
		expect(lotCoverage(site, site)).toBeCloseTo(50, 1);
	});

	it('no structures → 0%', () => {
		const site = makeSite({ parcel: [[0,0],[10,0],[10,10],[0,10]] });
		expect(lotCoverage(site, site)).toBeCloseTo(0, 1);
	});
});

// --- useFloorAreaByUse ---

describe('useFloorAreaByUse', () => {
	it('single structure single use → full GFA', () => {
		const site = makeSite({
			structures: [makeStructure({
				uses: ['worship'],
				stories: 2,
				parts: [makePart({ w: 10, d: 5 })],
			})],
		});
		const result = useFloorAreaByUse(site);
		expect(result.worship).toBeCloseTo(100, 1); // 10*5*2 = 100
	});

	it('two equal-weight uses split GFA 50/50', () => {
		const site = makeSite({
			structures: [makeStructure({
				uses: ['worship', 'fellowship'],
				useWeights: { worship: 50, fellowship: 50 },
				stories: 1,
				parts: [makePart({ w: 10, d: 10 })],
			})],
		});
		const result = useFloorAreaByUse(site);
		expect(result.worship).toBeCloseTo(50, 1);
		expect(result.fellowship).toBeCloseTo(50, 1);
	});

	it('two structures different uses sum correctly', () => {
		const site = makeSite({
			structures: [
				makeStructure({ id: 's1', uses: ['worship'], stories: 1, parts: [makePart({ id: 'p1', w: 10, d: 10 })] }),
				makeStructure({ id: 's2', uses: ['housing'], stories: 2, parts: [makePart({ id: 'p2', w: 5, d: 5 })] }),
			],
		});
		const result = useFloorAreaByUse(site);
		expect(result.worship).toBeCloseTo(100, 1);
		expect(result.housing).toBeCloseTo(50, 1);
	});

	it('no uses → empty', () => {
		const site = makeSite({ structures: [makeStructure({ uses: [] })] });
		expect(useFloorAreaByUse(site)).toEqual({});
	});
});

// --- generateActionSteps ---

describe('generateActionSteps', () => {
	it('no structures → no steps', () => {
		expect(generateActionSteps(makeSite(), makeSite())).toEqual([]);
	});

	it('no green space → flag', () => {
		const site = makeSite({
			structures: [makeStructure()],
			openSpaces: [],
		});
		const steps = generateActionSteps(site, site);
		expect(steps.some((s) => s.severity === 'flag' && s.category === 'green-space')).toBe(true);
	});

	it('all-existing status → info step', () => {
		const site = makeSite({
			structures: [makeStructure({ status: 'existing' })],
		});
		const steps = generateActionSteps(site, site);
		expect(steps.some((s) => s.severity === 'info' && s.category === 'pattern')).toBe(true);
	});

	it('urban single-story buildings → density suggest', () => {
		const site = makeSite({
			siteType: 'urban',
			structures: [makeStructure({ stories: 1 })],
		});
		const steps = generateActionSteps(site, site);
		expect(steps.some((s) => s.severity === 'suggest' && s.category === 'density')).toBe(true);
	});

	it('housing use with no dwellings → flag', () => {
		const site = makeSite({
			structures: [makeStructure({ uses: ['housing'], dwellings: undefined })],
		});
		const steps = generateActionSteps(site, site);
		expect(steps.some((s) => s.severity === 'flag' && s.category === 'program')).toBe(true);
	});

	it('parking > green space → suggest', () => {
		const site = makeSite({
			structures: [makeStructure()],
			openSpaces: [
				{ id: 'os1', kind: 'parking', polygon: [[0,0],[20,0],[20,20],[0,20]] },
				{ id: 'os2', kind: 'lawn', polygon: [[0,0],[5,0],[5,5],[0,5]] },
			],
		});
		const steps = generateActionSteps(site, site);
		expect(steps.some((s) => s.severity === 'suggest' && s.category === 'green-space')).toBe(true);
	});
});
