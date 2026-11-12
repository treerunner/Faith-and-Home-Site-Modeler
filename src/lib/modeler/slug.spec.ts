import { describe, it, expect } from 'vitest';
import { assignPlanSlugs, findPlanBySlug, pickSlug, slugify, RESERVED_SITE_SLUGS } from './slug';
import type { Plan, Site } from './types';

describe('slugify', () => {
	it.each([
		['Grace Church', 'grace-church'],
		["St. Mary's Parish", 'st-marys-parish'],
		['Iglesia de San José', 'iglesia-de-san-jose'],
		['  First  Baptist / Annex!  ', 'first-baptist-annex'],
		['Scenario 2: housing', 'scenario-2-housing'],
		['', 'untitled'],
		['!!!', 'untitled'],
	])('%j -> %j', (name, slug) => {
		expect(slugify(name)).toBe(slug);
	});

	it('trims long names at a word boundary', () => {
		const slug = slugify('The Congregation of the Holy Redeemer Fellowship Hall and Sunday School Wing');
		expect(slug.length).toBeLessThanOrEqual(50);
		expect(slug).toBe('the-congregation-of-the-holy-redeemer-fellowship');
	});
});

describe('pickSlug', () => {
	it('uses the plain slug when free', () => {
		expect(pickSlug('Grace Church', new Set(), [])).toBe('grace-church');
	});

	it('numbers collisions from 2', () => {
		expect(pickSlug('Grace Church', new Set(['grace-church']), [])).toBe('grace-church-2');
		expect(pickSlug('Grace Church', new Set(['grace-church', 'grace-church-2']), [])).toBe('grace-church-3');
	});

	it('avoids reserved words', () => {
		expect(pickSlug('Sites', new Set(), RESERVED_SITE_SLUGS)).toBe('sites-2');
	});

	it('keeps the current slug while it still matches the name', () => {
		const taken = new Set(['grace-church']);
		expect(pickSlug('Grace Church', taken, [], 'grace-church-2')).toBe('grace-church-2');
		expect(pickSlug('Grace Church', new Set(), [], 'grace-church')).toBe('grace-church');
	});

	it('moves to a new slug after a rename', () => {
		expect(pickSlug('Grace Chapel', new Set(), [], 'grace-church')).toBe('grace-chapel');
	});

	it('does not treat a longer name as a numbered copy', () => {
		// "grace-church-annex" is not "grace-church-N"
		expect(pickSlug('Grace Church', new Set(), [], 'grace-church-annex')).toBe('grace-church');
	});
});

function makePlan(name: string, slug = '', oldSlugs?: string[]): Plan {
	return { id: name, name, slug, oldSlugs, structures: [], openSpaces: [], trees: [], annotations: [] };
}

function makeSite(plans: Plan[]): Site {
	return { id: 's', name: 'Site', mode: 'grid', context: { footprints: [], roads: [] }, plans };
}

describe('assignPlanSlugs', () => {
	it('slugs new plans and numbers duplicate names', () => {
		const site = makeSite([makePlan('Housing'), makePlan('Housing'), makePlan('View')]);
		assignPlanSlugs(site);
		expect(site.plans.map((p) => p.slug)).toEqual(['housing', 'housing-2', 'view-2']);
	});

	it('keeps old slugs on rename so links redirect', () => {
		const site = makeSite([makePlan('Cottage court', 'housing')]);
		assignPlanSlugs(site);
		expect(site.plans[0]).toMatchObject({ slug: 'cottage-court', oldSlugs: ['housing'] });
		site.plans[0].name = 'Infill';
		assignPlanSlugs(site);
		expect(site.plans[0]).toMatchObject({ slug: 'infill', oldSlugs: ['housing', 'cottage-court'] });
	});

	it("does not give a plan another plan's old slug", () => {
		const site = makeSite([makePlan('Cottage court', 'cottage-court', ['housing']), makePlan('Housing')]);
		assignPlanSlugs(site);
		expect(site.plans[1].slug).toBe('housing-2');
	});

	it('reuses its own old slug when renamed back', () => {
		const site = makeSite([makePlan('Housing', 'cottage-court', ['housing'])]);
		assignPlanSlugs(site);
		expect(site.plans[0]).toMatchObject({ slug: 'housing', oldSlugs: ['cottage-court'] });
	});

	it('leaves unchanged plans alone', () => {
		const site = makeSite([makePlan('Housing', 'housing')]);
		assignPlanSlugs(site);
		expect(site.plans[0]).toEqual(makePlan('Housing', 'housing'));
	});
});

describe('findPlanBySlug', () => {
	const plans = [makePlan('A', 'a', ['old-a']), makePlan('B', 'b')];

	it('matches current then old slugs', () => {
		expect(findPlanBySlug(plans, 'b')?.name).toBe('B');
		expect(findPlanBySlug(plans, 'old-a')?.name).toBe('A');
		expect(findPlanBySlug(plans, 'nope')).toBeUndefined();
	});
});
