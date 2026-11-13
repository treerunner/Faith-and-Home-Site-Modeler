import { describe, it, expect } from 'vitest';
import { buildingType, inferBuildingType, planBuildings } from './metrics';
import { polygonDistance } from './geo';
import type { Part, Plan, Structure } from './types';

type Pt = [number, number];
let n = 0;

function piece(x: number, y: number, w: number, d: number, shape: Part['shape'] = 'rect'): Part {
	return { id: `p${n++}`, shape, x, y, w, d, rotation: 0 };
}

function structure(parts: Part[], overrides: Partial<Structure> = {}): Structure {
	return {
		id: `s${n++}`, label: 'S', status: 'existing', uses: [], stories: 1, floorHeight: 3.5,
		roof: 'flat', parts, provenance: 'user', ...overrides,
	};
}

function plan(structures: Structure[], overrides: Partial<Plan> = {}): Plan {
	return { id: 'p', name: 'P', slug: 'p', structures, openSpaces: [], trees: [], annotations: [], ...overrides };
}

// A 30 x 12 m nave at the origin; additions placed relative to it
const nave = () => structure([piece(0, 0, 30, 12)]);

describe('polygonDistance', () => {
	const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

	it('is zero for touching, overlapping and crossing shapes', () => {
		expect(polygonDistance(sq(0, 0, 10), sq(10, 0, 10))).toBe(0);
		expect(polygonDistance(sq(0, 0, 10), sq(5, 5, 10))).toBe(0);
		const bar: Pt[] = [[-20, -2], [20, -2], [20, 2], [-20, 2]];
		const post: Pt[] = [[-2, -20], [2, -20], [2, 20], [-2, 20]];
		expect(polygonDistance(bar, post)).toBe(0); // a plus: no corner inside the other
	});

	it('measures the gap between separate shapes', () => {
		expect(polygonDistance(sq(0, 0, 10), sq(13, 0, 10))).toBeCloseTo(3);
		expect(polygonDistance(sq(0, 0, 10), sq(13, 14, 10))).toBeCloseTo(5); // corner to corner
	});
});

describe('planBuildings', () => {
	it('joins touching structures even when they were never grouped', () => {
		const hall = structure([piece(21, 0, 12, 10)]); // touches the nave's east end
		const shed = structure([piece(0, 40, 4, 4)]);
		expect(planBuildings(plan([nave(), hall, shed])).map((b) => b.length).sort()).toEqual([1, 2]);
	});

	it('joins grouped structures even when apart, and leaves out removed ones', () => {
		const a = structure([piece(0, 0, 10, 10)], { groupId: 'g' });
		const b = structure([piece(40, 0, 10, 10)], { groupId: 'g' });
		const gone = structure([piece(0, 40, 10, 10)], { status: 'removed' });
		expect(planBuildings(plan([a, b, gone]))).toHaveLength(1);
	});
});

describe('inferBuildingType', () => {
	it('is null with nothing built', () => {
		expect(inferBuildingType(plan([]))).toBeNull();
	});

	it('Box: one building of one piece', () => {
		expect(inferBuildingType(plan([nave()]))).toBe('box');
	});

	it('Box-Plus: any number of touching pieces, grouped or not', () => {
		const wing = structure([piece(21, 0, 12, 10)]);
		const tower = structure([piece(-17, 0, 4, 4)]);
		expect(inferBuildingType(plan([nave(), wing]))).toBe('box_plus');
		expect(inferBuildingType(plan([nave(), wing, tower]))).toBe('box_plus'); // three touching pieces
		expect(inferBuildingType(plan([structure([piece(0, 0, 30, 12), piece(21, 0, 12, 10)])]))).toBe('box_plus');
	});

	it('Object: the main building has a triangle or circle', () => {
		expect(inferBuildingType(plan([structure([piece(0, 0, 30, 30, 'tri')])]))).toBe('object');
		expect(inferBuildingType(plan([structure([piece(0, 0, 30, 30, 'circle')]), structure([piece(20, 0, 10, 8)])]))).toBe('object');
	});

	it('Cluster: a Box-Plus with two buildings nearby', () => {
		const wing = structure([piece(21, 0, 12, 10)]);
		const rectory = structure([piece(0, 30, 12, 10)]);
		const school = structure([piece(-40, 0, 15, 20)]);
		expect(inferBuildingType(plan([nave(), wing, rectory, school]))).toBe('cluster');
		// With only one other building, the main building decides
		expect(inferBuildingType(plan([nave(), wing, rectory]))).toBe('box_plus');
	});

	it('ignores sheds and far-off buildings when counting a cluster', () => {
		const shed1 = structure([piece(0, 20, 4, 4)]);
		const shed2 = structure([piece(10, 20, 4, 4)]);
		const farBarn = structure([piece(200, 0, 20, 15)]);
		const rectory = structure([piece(0, 30, 12, 10)]);
		expect(inferBuildingType(plan([nave(), shed1, shed2]))).toBe('box');
		expect(inferBuildingType(plan([nave(), rectory, farBarn]))).toBe('box');
	});

	it('Cluster wins over Object when the campus has several buildings', () => {
		const round = structure([piece(0, 0, 30, 30, 'circle')]);
		const a = structure([piece(0, 30, 12, 10)]);
		const b = structure([piece(-40, 0, 12, 10)]);
		expect(inferBuildingType(plan([round, a, b]))).toBe('cluster');
	});
});

describe('the front question', () => {
	it('makes a main building with no clear front, or several, an Object', () => {
		expect(inferBuildingType(plan([nave()]), { mainBuildingFront: 'none' })).toBe('object');
		expect(inferBuildingType(plan([nave()]), { mainBuildingFront: 'several' })).toBe('object');
		expect(inferBuildingType(plan([nave()]), { mainBuildingFront: 'clear' })).toBe('box');
		expect(inferBuildingType(plan([nave()]))).toBe('box');
	});

	it('outranks Box-Plus', () => {
		const wing = structure([piece(21, 0, 12, 10)]);
		expect(inferBuildingType(plan([nave(), wing]), { mainBuildingFront: 'several' })).toBe('object');
	});

	it('leaves a cluster a cluster, as with St. Tim\'s and its cottages', () => {
		const cottage = (x: number, y: number) => structure([piece(x, y, 8, 6)]);
		const church = nave();
		const front = { mainBuildingFront: 'several' } as const;
		expect(inferBuildingType(plan([church]), front)).toBe('object'); // existing conditions
		expect(inferBuildingType(plan([church, cottage(0, 25), cottage(15, 25), cottage(-30, 0)]), front)).toBe('cluster');
	});
});

describe('buildingType', () => {
	it('prefers the override and falls back to the inferred type', () => {
		expect(buildingType(plan([nave()], { buildingTypeOverride: 'object' }))).toBe('object');
		expect(buildingType(plan([nave()]))).toBe('box');
	});
});
