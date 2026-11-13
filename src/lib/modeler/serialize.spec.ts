import { describe, it, expect } from 'vitest';
import { DEFAULT_PLAN_NAME, normalizeSite, SiteFormatError } from './serialize';
import type { Plan, Site } from './types';

function makePlan(overrides: Partial<Plan> = {}): Plan {
	return {
		id: 'plan1', name: 'Housing on the lot', slug: 'housing-on-the-lot', oldSlugs: ['housing'],
		structures: [
			{
				id: 's1', label: 'Sanctuary', status: 'existing', uses: ['worship', 'housing'],
				stories: 2, floorHeight: 9, roof: 'gable', provenance: 'user', basement: true,
				useWeights: { worship: 2, housing: 1 }, dwellings: 6, groupId: 'g1',
				parts: [{ id: 'p1', shape: 'rect', x: 1, y: 2, w: 10, d: 6, rotation: 15, ridgeAxis: 'w' }],
			},
		],
		openSpaces: [{ id: 'o1', kind: 'parking', polygon: [[0, 0], [10, 0], [10, 5]], label: 'Lot' }],
		trees: [{ id: 't1', x: 3, y: 4, radius: 2.5, height: 8 }],
		annotations: [{ n: 1, x: 0, y: 0, text: 'Entry' }],
		...overrides,
	};
}

function makeSite(overrides: Partial<Site> = {}): Site {
	return {
		id: 'site1', name: 'Grace Church', mode: 'grid', siteType: 'suburban',
		context: { buildings: [], roads: [] },
		congregationProfile: { size: 'small', tenure: 'historic', notes: 'Shared kitchen' },
		plans: [makePlan()],
		...overrides,
	};
}

describe('normalizeSite', () => {
	it('round trips a full site unchanged', () => {
		const site = makeSite();
		expect(normalizeSite(JSON.parse(JSON.stringify(site)))).toEqual(site);
	});

	it('wraps a site saved before plans into one plan', () => {
		const legacy = {
			id: 'old', name: 'Old', siteType: 'urban',
			structures: [{ id: 's1', status: 'existing', parts: [{ id: 'p1', shape: 'square', x: 0, y: 0, w: 6, d: 6 }] }],
			trees: [{ id: 't1', x: 1, y: 1, radius: 2, height: 6 }],
		};
		const site = normalizeSite(legacy);
		expect(site.siteType).toBe('urban');
		expect(site.plans).toHaveLength(1);
		const plan = site.plans[0];
		expect(plan).toMatchObject({ id: 'old', name: DEFAULT_PLAN_NAME, slug: 'existing-conditions' });
		expect(plan.trees).toHaveLength(1);
		expect(plan.openSpaces).toEqual([]);
		expect(plan.annotations).toEqual([]);
		expect('structures' in site).toBe(false);
	});

	it('fills defaults for fields missing from older saves', () => {
		const site = normalizeSite({
			id: 'old',
			plans: [{ id: 'p', name: 'Plan', structures: [{ id: 's1', status: 'existing', parts: [{ id: 'p1', shape: 'square', x: 0, y: 0, w: 6, d: 6 }] }] }],
		});
		expect(site.mode).toBe('grid');
		expect(site.context).toEqual({ buildings: [], roads: [] });
		expect(site.plans[0].slug).toBe('plan');
		const s = site.plans[0].structures[0];
		expect(s).toMatchObject({ label: '', uses: [], stories: 1, floorHeight: 3.5, roof: 'flat', provenance: 'user' });
		expect(s.parts[0].rotation).toBe(0);
	});

	it('reads the pre-M6 context shape', () => {
		const site = normalizeSite({
			id: 'old',
			context: { footprints: [[[0, 0], [5, 0], [5, 5]]], roads: [[[0, 0], [10, 0]]] },
		});
		expect(site.context).toEqual({
			buildings: [{ polygon: [[0, 0], [5, 0], [5, 5]], height: 8 }],
			roads: [{ line: [[0, 0], [10, 0]], kind: 'residential' }],
		});
	});

	it('keeps address mode fields', () => {
		const site = makeSite({
			mode: 'address', address: '27 Memorial Dr W, Bethlehem, PA', origin: { lat: 40.6071, lng: -75.3792 },
			parcel: [[0, 0], [40, 0], [40, 30], [0, 30]],
			context: { buildings: [{ polygon: [[50, 50], [60, 50], [60, 60]], height: 7 }], roads: [{ line: [[-100, 0], [100, 0]], kind: 'primary' }] },
		});
		expect(normalizeSite(JSON.parse(JSON.stringify(site)))).toEqual(site);
	});

	it('keeps poly outlines and requires at least 3 points', () => {
		const poly = { id: 'p2', shape: 'poly' as const, x: 0, y: 0, w: 30, d: 22, rotation: 25, points: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]] as [number, number][] };
		const plan = makePlan({ structures: [{ ...makePlan().structures[0], heightSource: 'default', parts: [poly] }] });
		expect(normalizeSite(JSON.parse(JSON.stringify(makeSite({ plans: [plan] })))).plans[0].structures[0]).toMatchObject({
			heightSource: 'default',
			parts: [poly],
		});
		const bad = makePlan({ structures: [{ ...makePlan().structures[0], parts: [{ ...poly, points: [[0, 0]] }] }] });
		expect(() => normalizeSite(makeSite({ plans: [bad] }))).toThrow('site.plans[0].structures[0].parts[0].points');
	});

	it('drops points from non-poly parts', () => {
		const rect = { id: 'p3', shape: 'rect' as const, x: 0, y: 0, w: 1, d: 1, rotation: 0, points: [[0, 0], [1, 0], [1, 1]] as [number, number][] };
		const plan = makePlan({ structures: [{ ...makePlan().structures[0], parts: [rect] }] });
		expect(normalizeSite(makeSite({ plans: [plan] })).plans[0].structures[0].parts[0].points).toBeUndefined();
	});

	it('turns a structure saved with the old Reuse status into Existing with a whole-building zone', () => {
		const legacy = {
			id: 'old',
			plans: [{
				id: 'p', name: 'P',
				structures: [{
					id: 's1', status: 'adaptive_reuse', uses: ['worship', 'housing'], useWeights: { worship: 20, housing: 80 },
					stories: 3, dwellings: 6,
					parts: [{ id: 'a', shape: 'rect', x: 5, y: 5, w: 20, d: 10, rotation: 30 }],
				}],
			}],
		};
		const s = normalizeSite(legacy).plans[0].structures[0];
		expect(s.status).toBe('existing');
		expect(s.dwellings).toBeUndefined();
		expect(s.reuseZones).toHaveLength(1);
		const zone = s.reuseZones![0];
		expect(zone).toMatchObject({ partId: 'a', floors: [1, 3], use: 'housing', dwellings: 6 });
		// The zone covers the whole part: its corners in the part's normalized frame
		for (const [u, v] of zone.points) {
			expect(Math.abs(u)).toBeCloseTo(0.5);
			expect(Math.abs(v)).toBeCloseTo(0.5);
		}
	});

	it('validates reuse zones', () => {
		const base = makePlan().structures[0];
		const zone = { id: 'z', partId: 'p1', points: [[-0.5, -0.5], [0, -0.5], [0, 0.5]], floors: [2, 2], use: 'housing' };
		const ok = makeSite({ plans: [makePlan({ structures: [{ ...base, reuseZones: [zone as never] }] })] });
		expect(normalizeSite(ok).plans[0].structures[0].reuseZones![0]).toMatchObject({ floors: [2, 2], use: 'housing' });
		const wrongPart = makeSite({ plans: [makePlan({ structures: [{ ...base, reuseZones: [{ ...zone, partId: 'nope' } as never] }] })] });
		expect(() => normalizeSite(wrongPart)).toThrow('reuseZones[0].partId');
		const badFloors = makeSite({ plans: [makePlan({ structures: [{ ...base, reuseZones: [{ ...zone, floors: [3, 2] } as never] }] })] });
		expect(() => normalizeSite(badFloors)).toThrow('reuseZones[0].floors');
	});

	it('drops unknown fields', () => {
		const site = normalizeSite({ ...makeSite(), extra: 'x' });
		expect('extra' in site).toBe(false);
	});

	const plan = makePlan();
	it.each([
		['not an object', 'site'],
		[{ ...makeSite(), id: 5 }, 'site.id'],
		[makeSite({ plans: [] }), 'site.plans'],
		[makeSite({ plans: [plan, { ...plan, slug: 'other' }] }), 'site.plans[1].id'],
		[makeSite({ plans: [plan, { ...plan, id: 'plan2', slug: 'housing', oldSlugs: [] }] }), 'site.plans[1].slug'],
		[makeSite({ plans: [{ ...plan, structures: 'nope' as never }] }), 'site.plans[0].structures'],
		[makeSite({ plans: [{ ...plan, structures: [{ ...plan.structures[0], status: 'demolished' as never }] }] }), 'site.plans[0].structures[0].status'],
		[makeSite({ plans: [{ ...plan, trees: [{ id: 't', x: Number.NaN, y: 0, radius: 1, height: 1 }] }] }), 'site.plans[0].trees[0].x'],
		[makeSite({ plans: [{ ...plan, openSpaces: [{ id: 'o', kind: 'lawn', polygon: [[0, 0, 0]] as never }] }] }), 'site.plans[0].openSpaces[0].polygon[0]'],
	])('rejects invalid input (%#)', (input, path) => {
		expect(() => normalizeSite(input)).toThrow(SiteFormatError);
		expect(() => normalizeSite(input)).toThrow(path);
	});
});
