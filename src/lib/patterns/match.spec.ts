import { describe, it, expect } from 'vitest';
import { matchHint, rankPatterns, scorePattern, siteFacts } from './match';
import type { Pattern } from './catalog';
import type { Part, Plan, ReuseZone, Site, Structure } from '../modeler/types';

let n = 0;
const part = (x: number, y: number, w: number, d: number): Part => ({ id: `p${n++}`, shape: 'rect', x, y, w, d, rotation: 0 });
const structure = (parts: Part[], overrides: Partial<Structure> = {}): Structure => ({
	id: `s${n++}`, label: 'S', status: 'existing', uses: [], stories: 2, floorHeight: 3.5, roof: 'flat', parts, provenance: 'user', ...overrides,
});
const plan = (structures: Structure[]): Plan => ({ id: 'p', name: 'P', slug: 'p', structures, openSpaces: [], trees: [], annotations: [] });
const site = (overrides: Partial<Site> = {}): Site => ({ id: 's', name: 'S', mode: 'grid', context: { buildings: [], roads: [] }, plans: [], ...overrides });

// A nave with a touching wing (Box-Plus); the wing's whole footprint reused as housing on 2 floors
function boxPlusWithHousingReuse(): Plan {
	const nave = structure([part(0, 0, 30, 12)]);
	const wingPart = part(21, 0, 12, 20);
	const zone: ReuseZone = { id: 'z', partId: wingPart.id, points: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], floors: [1, 2], use: 'housing' };
	const wing = structure([wingPart], { reuseZones: [zone] });
	return plan([nave, wing]);
}

const pattern = (traits: Pattern['traits'], name = 'P'): Pattern => ({ slug: name.toLowerCase(), name, summary: '', sections: [], placeholder: true, traits });

describe('siteFacts', () => {
	it('reads building type, intervention, housing and the profile', () => {
		const facts = siteFacts(site({ siteType: 'urban', congregationProfile: { size: 'small', partnering: 'open' } }), boxPlusWithHousingReuse());
		// 12 x 20 m x 2 floors = 480 m² = 5,167 sq ft: 5 units at 900 sq ft
		expect(facts).toEqual({ buildingTypes: 'box_plus', siteTypes: 'urban', interventions: 'reuse', housing: 'some', size: 'small', partnering: 'open' });
	});

	it('tells reuse, new construction, both and none apart', () => {
		const p = boxPlusWithHousingReuse();
		p.structures.push(structure([part(0, 60, 10, 10)], { status: 'new', uses: ['housing'], dwellings: 12 }));
		expect(siteFacts(site(), p)).toMatchObject({ interventions: 'both', housing: 'significant' });
		expect(siteFacts(site(), plan([structure([part(0, 0, 10, 10)])]))).toMatchObject({ interventions: 'none', housing: 'none' });
	});

	it('knows nothing spatial about an empty plan', () => {
		expect(siteFacts(site(), plan([]))).toEqual({});
	});
});

describe('scorePattern', () => {
	const facts = { buildingTypes: 'box_plus', siteTypes: 'urban', interventions: 'reuse' };

	it('fits fully when the pattern allows every known answer', () => {
		const m = scorePattern(pattern({ buildingTypes: ['box_plus'], siteTypes: ['urban'], interventions: ['reuse', 'both'] }), facts);
		expect(m.fit).toBe(1);
		expect(m.matches).toEqual(['Box-Plus', 'urban site', 'adaptive reuse']);
		expect(m.differs).toEqual([]);
	});

	it('weighs a mismatch by the trait weight', () => {
		// building type (3) and site type (2) agree; intervention (3) differs: 5 / 8
		const m = scorePattern(pattern({ buildingTypes: ['box_plus'], siteTypes: ['urban'], interventions: ['new'] }), facts);
		expect(m.fit).toBeCloseTo(5 / 8);
		expect(m.differs).toEqual(['adaptive reuse']);
	});

	it('gives half credit for traits the pattern leaves open', () => {
		// building type agrees (3); site type (2) and intervention (3) are "any": (3 + 1 + 1.5) / 8
		const m = scorePattern(pattern({ buildingTypes: ['box_plus'] }), facts);
		expect(m.fit).toBeCloseTo(5.5 / 8);
		expect(m.matches).toEqual(['Box-Plus']);
	});

	it('ignores traits the site has no answer for', () => {
		const withRole = scorePattern(pattern({ buildingTypes: ['box_plus'], siteTypes: ['urban'], interventions: ['reuse'], role: ['gathering'] }), facts);
		expect(withRole.fit).toBe(1);
	});

	it('ranks a specific match above a vague one', () => {
		const known = { ...facts, housing: 'none', partnering: 'open' };
		const specific = scorePattern(pattern({ buildingTypes: ['box_plus'], siteTypes: ['urban'], interventions: ['reuse'], housing: ['some'] }), known);
		const vague = scorePattern(pattern({ interventions: ['reuse'], housing: ['none'] }), known);
		expect(specific.fit).toBeGreaterThan(vague.fit);
	});

	it('scores zero with nothing known', () => {
		expect(scorePattern(pattern({ role: ['gathering'] }), {}).fit).toBe(0);
	});
});

describe('rankPatterns', () => {
	it('puts the best fit first and breaks ties by agreement', () => {
		const facts = { buildingTypes: 'cluster', siteTypes: 'rural', interventions: 'new' };
		const ranked = rankPatterns(
			[
				pattern({ buildingTypes: ['box'] }, 'Box only'),
				pattern({ buildingTypes: ['cluster'] }, 'Cluster only'),
				pattern({ buildingTypes: ['cluster'], siteTypes: ['rural'], interventions: ['new'] }, 'Rural cluster'),
			],
			facts,
		);
		expect(ranked.map((m) => m.pattern.name)).toEqual(['Rural cluster', 'Cluster only', 'Box only']);
	});
});

describe('matchHint', () => {
	it('asks for what would sharpen the match', () => {
		expect(matchHint({})).toMatch('Add buildings');
		expect(matchHint({ buildingTypes: 'box' })).toMatch('site type');
		expect(matchHint({ buildingTypes: 'box', siteTypes: 'urban', size: 'small' })).toMatch('Social questions');
		expect(matchHint({ buildingTypes: 'box', siteTypes: 'urban', size: 'small', role: 'gathering' })).toBeNull();
	});
});
