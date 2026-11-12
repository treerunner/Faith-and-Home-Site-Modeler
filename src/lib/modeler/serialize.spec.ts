import { describe, it, expect } from 'vitest';
import { DEFAULT_PLAN_NAME, normalizeSite, SiteFormatError } from './serialize';
import type { Plan, Site } from './types';

function makePlan(overrides: Partial<Plan> = {}): Plan {
	return {
		id: 'plan1', name: 'Housing on the lot', slug: 'housing-on-the-lot', oldSlugs: ['housing'],
		structures: [
			{
				id: 's1', label: 'Sanctuary', status: 'adaptive_reuse', uses: ['worship', 'housing'],
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
		context: { footprints: [], roads: [] },
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
		expect(site.context).toEqual({ footprints: [], roads: [] });
		expect(site.plans[0].slug).toBe('plan');
		const s = site.plans[0].structures[0];
		expect(s).toMatchObject({ label: '', uses: [], stories: 1, floorHeight: 3.5, roof: 'flat', provenance: 'user' });
		expect(s.parts[0].rotation).toBe(0);
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
