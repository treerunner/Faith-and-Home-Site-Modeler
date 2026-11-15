import { describe, it, expect } from 'vitest';
import { rowsFromSite, siteFromRows } from './site-rows';
import { normalizeSite } from '../modeler/serialize';
import { storedSite } from '../modeler/existing';
import type { Site } from '../modeler/types';

const plan = (id: string, name: string) => ({ id, name, slug: name.toLowerCase(), structures: [], openSpaces: [], trees: [], annotations: [] });
const site: Site = {
	id: 's1', name: 'Grace', mode: 'grid', context: { buildings: [], roads: [] },
	existing: { id: 'e', name: 'Existing conditions', slug: '', structures: [], openSpaces: [], trees: [], annotations: [] },
	plans: [plan('a', 'Housing'), { ...plan('b', 'Cottages'), oldSlugs: ['old'] }],
};

describe('site rows', () => {
	it('stores plans as rows in order and assembles them back', () => {
		const { data, plans } = rowsFromSite(storedSite(site));
		expect('plans' in data).toBe(false);
		expect(plans.map((p) => [p.id, p.position, p.oldSlugs])).toEqual([['a', 0, null], ['b', 1, ['old']]]);
		const back = normalizeSite(siteFromRows(data as Record<string, unknown>, [...plans].reverse()));
		expect(back).toEqual(normalizeSite(JSON.parse(JSON.stringify(storedSite(site)))));
	});

	it('reads plans from the data of a site saved before the plans table', () => {
		const legacy = JSON.parse(JSON.stringify(storedSite(site)));
		expect(normalizeSite(siteFromRows(legacy, [])).plans.map((p) => p.name)).toEqual(['Housing', 'Cottages']);
	});
});
