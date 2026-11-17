import { describe, it, expect } from 'vitest';
import { DEFAULT_PLAN_NAME, normalizeSite, planUuid, SiteFormatError } from './serialize';
import { storedSite } from './existing';
import type { Plan, Site, Structure } from './types';

function makePlan(overrides: Partial<Plan> = {}): Plan {
	return {
		id: '0b6f1d2e-4c3a-4e1f-9a2b-7c8d9e0f1a2b', name: 'Housing on the lot', slug: 'housing-on-the-lot', oldSlugs: ['housing'],
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

// A site with one building on the site view and no plans
function siteWith(structure: Structure): Site {
	const site = makeSite({ plans: [] });
	site.existing.structures = [structure];
	return site;
}

// Saved and loaded, as the API does
const roundTrip = (site: Site) => normalizeSite(JSON.parse(JSON.stringify(storedSite(site))));

function makeSite(overrides: Partial<Site> = {}): Site {
	return {
		id: 'site1', name: 'Grace Church', mode: 'grid', siteType: 'suburban',
		context: { buildings: [], roads: [] },
		congregationProfile: { size: 'small', tenure: 'historic', notes: 'Shared kitchen' },
		// The plan's Sanctuary is its copy of the site's
		existing: { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Existing conditions', slug: '', structures: structuredClone(makePlan().structures), openSpaces: [], trees: [], annotations: [] },
		plans: [makePlan()],
		...overrides,
	};
}

describe('normalizeSite', () => {
	it('round trips a full site unchanged', () => {
		const site = makeSite();
		expect(roundTrip(site)).toEqual(site);
	});

	it('saves a plan\'s choices, not its copies of the site\'s buildings', () => {
		const site = makeSite();
		const zone = { id: 'z', partId: 'p1', points: [[-0.5, -0.5], [0, -0.5], [0, 0.5]] as [number, number][], floors: [1, 2] as [number, number], use: 'housing' as const };
		Object.assign(site.plans[0].structures[0], { addedStories: 1, roof: 'flat', planRoof: 'flat', reuseZones: [zone] });
		site.plans[0].structures.push({ ...structuredClone(site.plans[0].structures[0]), id: 's2', status: 'new', addedStories: undefined, planRoof: undefined, reuseZones: undefined });
		const stored = storedSite(site);
		expect(stored.plans[0].structures.map((s) => s.id)).toEqual(['s2']);
		expect(stored.plans[0].existingChoices).toEqual({ s1: { addedStories: 1, roof: 'flat', reuseZones: [zone] } });
		expect(roundTrip(site).plans[0].structures[0]).toMatchObject({ addedStories: 1, roof: 'flat', reuseZones: [zone] });
	});

	it('keeps a plan\'s own buildings new, and drops choices on buildings the site no longer has', () => {
		const site = makeSite({ plans: [] });
		const raw = JSON.parse(JSON.stringify(storedSite(site)));
		raw.plans = [{ ...makePlan(), structures: [{ ...makePlan().structures[0], id: 'mine', status: 'existing' }], existingChoices: { gone: { removed: true }, s1: { removed: true, reuseZones: [{ id: 'z', partId: 'nope', points: [[0, 0], [1, 0], [1, 1]], floors: [1, 1], use: 'housing' }] } } }];
		const plan = normalizeSite(raw).plans[0];
		expect(plan.structures.map((s) => [s.id, s.status])).toEqual([['s1', 'removed'], ['mine', 'new']]);
		expect(plan.structures[0].reuseZones).toBeUndefined();
	});

	it('takes existing conditions from the first plan of a site saved before the site view', () => {
		const standing = makePlan().structures[0];
		const legacy = {
			id: 'old',
			plans: [
				{ id: 'a', name: 'Cottages', structures: [{ ...standing, status: 'removed' }, { ...standing, id: 'n1', status: 'new' }], openSpaces: makePlan().openSpaces },
				{ id: 'b', name: 'Hall', structures: [{ ...standing, id: 'shed', status: 'existing' }] },
			],
		};
		const site = normalizeSite(legacy);
		expect(site.existing.structures.map((s) => [s.id, s.status])).toEqual([['s1', 'existing'], ['shed', 'existing']]);
		expect(site.existing.openSpaces).toHaveLength(1);
		expect(site.plans.map((p) => p.name)).toEqual(['Cottages', 'Hall']);
		expect(site.plans[0].structures.map((s) => [s.id, s.status])).toEqual([['s1', 'removed'], ['shed', 'existing'], ['n1', 'new']]);
		// Hall never had the Sanctuary: it's gone in that plan
		expect(site.plans[1].structures.map((s) => [s.id, s.status])).toEqual([['s1', 'removed'], ['shed', 'existing']]);
	});

	it('makes an unchanged first "Existing conditions" plan the site view', () => {
		const standing = makePlan().structures[0];
		const site = normalizeSite({ id: 'old', plans: [{ id: 'ec1', name: DEFAULT_PLAN_NAME, slug: 'existing-conditions', structures: [standing] }] });
		expect(site.existing).toMatchObject({ id: planUuid('ec1'), name: DEFAULT_PLAN_NAME, slug: '' });
		expect(site.existing.structures).toHaveLength(1);
		expect(site.plans).toEqual([]);
	});

	it('wraps a site saved before plans into the site view', () => {
		const legacy = {
			id: 'old', name: 'Old', siteType: 'urban',
			structures: [{ id: 's1', status: 'existing', parts: [{ id: 'p1', shape: 'square', x: 0, y: 0, w: 6, d: 6 }] }],
			trees: [{ id: 't1', x: 1, y: 1, radius: 2, height: 6 }],
		};
		const site = normalizeSite(legacy);
		expect(site.siteType).toBe('urban');
		expect(site.plans).toHaveLength(0);
		expect(site.existing).toMatchObject({ id: 'old', name: DEFAULT_PLAN_NAME, slug: '' });
		expect(site.existing.structures).toHaveLength(1);
		expect(site.existing.trees).toHaveLength(1);
		expect(site.existing.openSpaces).toEqual([]);
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
		expect(roundTrip(site)).toEqual(site);
	});

	it('keeps poly outlines and requires at least 3 points', () => {
		const poly = { id: 'p2', shape: 'poly' as const, x: 0, y: 0, w: 30, d: 22, rotation: 25, points: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]] as [number, number][] };
		const site = siteWith({ ...makePlan().structures[0], heightSource: 'default', parts: [poly] });
		expect(roundTrip(site).existing.structures[0]).toMatchObject({ heightSource: 'default', parts: [poly] });
		const bad = siteWith({ ...makePlan().structures[0], parts: [{ ...poly, points: [[0, 0]] }] });
		expect(() => normalizeSite(bad)).toThrow('site.existing.structures[0].parts[0].points');
	});

	it('drops points from non-poly parts', () => {
		const rect = { id: 'p3', shape: 'rect' as const, x: 0, y: 0, w: 1, d: 1, rotation: 0, points: [[0, 0], [1, 0], [1, 1]] as [number, number][] };
		expect(normalizeSite(siteWith({ ...makePlan().structures[0], parts: [rect] })).existing.structures[0].parts[0].points).toBeUndefined();
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
		const zone = { id: 'z', partId: 'p1', points: [[-0.5, -0.5], [0, -0.5], [0, 0.5]], floors: [2, 2], use: 'housing' };
		const withZone = (z: object) => ({ ...makeSite(), plans: [{ ...makePlan(), existingChoices: { s1: { reuseZones: [z] } } }] });
		expect(normalizeSite(withZone(zone)).plans[0].structures[0].reuseZones![0]).toMatchObject({ floors: [2, 2], use: 'housing' });
		expect(() => normalizeSite(withZone({ ...zone, floors: [3, 2] }))).toThrow('existingChoices.s1.reuseZones[0].floors');
	});

	it('keeps the front answer', () => {
		expect(normalizeSite(makeSite({ mainBuildingFront: 'several' })).mainBuildingFront).toBe('several');
		expect(() => normalizeSite({ ...makeSite(), mainBuildingFront: 'sideways' })).toThrow('site.mainBuildingFront');
	});

	it('keeps the culture answers; roles are any number', () => {
		const profile = { size: 'small', partnering: 'open', capacity: 'volunteers', change: 'adapt', role: ['housing_partner', 'service'] } as const;
		expect(normalizeSite(makeSite({ congregationProfile: { ...profile, role: [...profile.role] } })).congregationProfile).toEqual(profile);
	});

	it('a role saved as one answer becomes a list of one', () => {
		const raw = { ...makeSite(), congregationProfile: { role: 'gathering' } };
		expect(normalizeSite(raw).congregationProfile).toEqual({ role: ['gathering'] });
		expect(normalizeSite({ ...makeSite(), congregationProfile: { role: ['nope'] } }).congregationProfile).toEqual({});
	});

	it('drops unknown fields', () => {
		const site = normalizeSite({ ...makeSite(), extra: 'x' });
		expect('extra' in site).toBe(false);
	});

	const plan = makePlan();
	it.each([
		['not an object', 'site'],
		[{ ...makeSite(), id: 5 }, 'site.id'],
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

describe('planUuid', () => {
	it('keeps uuids and turns older ids into the same uuid every time', () => {
		expect(planUuid('0B6F1D2E-4C3A-4E1F-9A2B-7C8D9E0F1A2B')).toBe('0b6f1d2e-4c3a-4e1f-9a2b-7c8d9e0f1a2b');
		expect(planUuid('p')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(planUuid('p')).toBe(planUuid('p'));
		expect(planUuid('p')).not.toBe(planUuid('q'));
	});
});
