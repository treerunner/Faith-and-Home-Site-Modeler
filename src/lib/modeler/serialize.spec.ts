import { describe, it, expect } from 'vitest';
import { normalizeSite, SiteFormatError } from './serialize';
import type { Site } from './types';

function makeSite(overrides: Partial<Site> = {}): Site {
	return {
		id: 'site1', name: 'Grace Church', mode: 'grid', siteType: 'suburban',
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
		context: { footprints: [], roads: [] },
		annotations: [{ n: 1, x: 0, y: 0, text: 'Entry' }],
		congregationProfile: { size: 'small', tenure: 'historic', notes: 'Shared kitchen' },
		...overrides,
	};
}

describe('normalizeSite', () => {
	it('round trips a full site unchanged', () => {
		const site = makeSite();
		expect(normalizeSite(JSON.parse(JSON.stringify(site)))).toEqual(site);
	});

	it('fills defaults for fields missing from older saves', () => {
		const site = normalizeSite({
			id: 'old', name: 'Old',
			structures: [{ id: 's1', status: 'existing', parts: [{ id: 'p1', shape: 'square', x: 0, y: 0, w: 6, d: 6 }] }],
		});
		expect(site.mode).toBe('grid');
		expect(site.trees).toEqual([]);
		expect(site.openSpaces).toEqual([]);
		expect(site.context).toEqual({ footprints: [], roads: [] });
		expect(site.annotations).toEqual([]);
		const s = site.structures[0];
		expect(s).toMatchObject({ label: '', uses: [], stories: 1, floorHeight: 3.5, roof: 'flat', provenance: 'user' });
		expect(s.parts[0].rotation).toBe(0);
	});

	it('drops unknown fields', () => {
		const site = normalizeSite({ ...makeSite(), extra: 'x' });
		expect('extra' in site).toBe(false);
	});

	it.each([
		['not an object', 'site'],
		[{ ...makeSite(), id: 5 }, 'site.id'],
		[{ ...makeSite(), structures: 'nope' }, 'site.structures'],
		[makeSite({ structures: [{ ...makeSite().structures[0], status: 'demolished' as never }] }), 'site.structures[0].status'],
		[makeSite({ trees: [{ id: 't', x: Number.NaN, y: 0, radius: 1, height: 1 }] }), 'site.trees[0].x'],
		[makeSite({ openSpaces: [{ id: 'o', kind: 'lawn', polygon: [[0, 0, 0]] as never }] }), 'site.openSpaces[0].polygon[0]'],
	])('rejects invalid input (%#)', (input, path) => {
		expect(() => normalizeSite(input)).toThrow(SiteFormatError);
		expect(() => normalizeSite(input)).toThrow(path);
	});
});
