import { describe, it, expect } from 'vitest';
import { cellLabel, conditionText, coverage, isComplete, nearestPattern, patternForCell, selectVariant, siteCell, type CompleteCell } from './match';
import { getPatterns, type Cells, type Pattern, type Variant } from './catalog';
import type { Part, Plan, ReuseZone, Site, Structure } from '../modeler/types';

let n = 0;
const part = (x: number, y: number, w: number, d: number): Part => ({ id: `p${n++}`, shape: 'rect', x, y, w, d, rotation: 0 });
const structure = (parts: Part[], overrides: Partial<Structure> = {}): Structure => ({
	id: `s${n++}`, label: 'S', status: 'existing', uses: [], stories: 2, floorHeight: 3.5, roof: 'flat', parts, provenance: 'user', ...overrides,
});
const plan = (structures: Structure[], overrides: Partial<Plan> = {}): Plan => ({ id: 'p', name: 'P', slug: 'p', structures, openSpaces: [], trees: [], annotations: [], ...overrides });
const site = (overrides: Partial<Site> = {}): Site => ({ id: 's', name: 'S', mode: 'grid', context: { buildings: [], roads: [] }, plans: [], ...overrides });

// A nave with a touching wing (Box-Plus); the wing's whole footprint reused as housing
function boxPlusWithHousingReuse(): Plan {
	const nave = structure([part(0, 0, 30, 12)]);
	const wingPart = part(21, 0, 12, 20);
	const zone: ReuseZone = { id: 'z', partId: wingPart.id, points: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], floors: [1, 2], use: 'housing' };
	return plan([nave, structure([wingPart], { reuseZones: [zone] })]);
}

const pattern = (slug: string, cells: Partial<Cells>, variants?: Variant[]): Pattern => ({
	slug, name: slug, summary: '', sections: [], placeholder: true,
	cells: { buildingTypes: ['box'], siteTypes: ['urban'], developmentTypes: ['reuse'], ...cells },
	variants,
});

const cell = (c: Partial<CompleteCell> = {}): CompleteCell => ({ buildingType: 'box', siteType: 'urban', developmentType: 'reuse', ...c });

describe('siteCell', () => {
	it('reads building type, site type and development type from the model', () => {
		const c = siteCell(site({ siteType: 'urban' }), boxPlusWithHousingReuse());
		expect(c).toEqual({ buildingType: 'box_plus', siteType: 'urban', developmentType: 'reuse' });
		expect(isComplete(c)).toBe(true);
		expect(cellLabel(c as CompleteCell)).toBe('Urban · Box-Plus · Adaptive reuse');
	});

	it('prefers the plan overrides', () => {
		const p = boxPlusWithHousingReuse();
		p.buildingTypeOverride = 'object';
		p.developmentTypeOverride = 'downsize_sell';
		expect(siteCell(site({ siteType: 'rural' }), p)).toEqual({ buildingType: 'object', siteType: 'rural', developmentType: 'downsize_sell' });
	});

	it('is incomplete without a site type or buildings', () => {
		expect(isComplete(siteCell(site(), boxPlusWithHousingReuse()))).toBe(false);
		const empty = siteCell(site({ siteType: 'urban' }), plan([]));
		expect(empty.buildingType).toBeUndefined();
		expect(isComplete(empty)).toBe(false);
	});
});

describe('patternForCell', () => {
	const patterns = [pattern('a', { buildingTypes: ['box', 'box_plus'] }), pattern('b', { developmentTypes: ['new'] })];

	it('finds the pattern covering a cell', () => {
		expect(patternForCell(patterns, cell({ buildingType: 'box_plus' }))?.slug).toBe('a');
		expect(patternForCell(patterns, cell({ developmentType: 'new' }))?.slug).toBe('b');
	});

	it('finds none for an uncovered cell', () => {
		expect(patternForCell(patterns, cell({ siteType: 'rural' }))).toBeNull();
	});
});

describe('nearestPattern', () => {
	it('picks the pattern differing on the fewest axes and names them', () => {
		const patterns = [pattern('two-off', { buildingTypes: ['cluster'], siteTypes: ['rural'] }), pattern('one-off', { siteTypes: ['suburban'] })];
		expect(nearestPattern(patterns, cell())).toEqual({ pattern: patterns[1], differs: ['siteType'] });
	});

	it('breaks ties by keeping development type, then building type, then site type', () => {
		const offDevelopment = pattern('dev', { developmentTypes: ['new'] });
		const offBuilding = pattern('bld', { buildingTypes: ['object'] });
		const offSite = pattern('site', { siteTypes: ['rural'] });
		expect(nearestPattern([offDevelopment, offBuilding, offSite], cell())?.pattern.slug).toBe('site');
		expect(nearestPattern([offDevelopment, offBuilding], cell())?.pattern.slug).toBe('bld');
	});

	it('keeps catalog order on a full tie', () => {
		const first = pattern('first', { siteTypes: ['rural'] });
		const second = pattern('second', { siteTypes: ['suburban'] });
		expect(nearestPattern([first, second], cell())?.pattern.slug).toBe('first');
	});

	it('finds nothing in an empty catalog', () => {
		expect(nearestPattern([], cell())).toBeNull();
	});
});

describe('selectVariant', () => {
	const partner: Variant = { key: 'partner', name: 'With a partner', summary: 's', when: { partnering: ['open'] } };
	const staffed: Variant = { key: 'staffed', name: 'Staffed', summary: 's', when: { capacity: ['some_staff', 'staffed'], change: ['adapt'] } };
	const p = pattern('p', {}, [partner, staffed]);

	it('picks the first variant whose conditions all hold', () => {
		expect(selectVariant(p, { partnering: 'open', capacity: 'staffed', change: 'adapt' })?.key).toBe('partner');
		expect(selectVariant(p, { partnering: 'unsure', capacity: 'staffed', change: 'adapt' })?.key).toBe('staffed');
	});

	it('does not count unanswered or partly met conditions', () => {
		expect(selectVariant(p, { capacity: 'staffed' })).toBeNull();
		expect(selectVariant(p, {})).toBeNull();
		expect(selectVariant(pattern('plain', {}))).toBeNull();
	});
});

describe('coverage', () => {
	it('lists all 60 cells with their pattern', async () => {
		const patterns = await getPatterns();
		const cells = coverage(patterns);
		expect(cells).toHaveLength(60);
		const urbanBoxReuse = cells.find((c) => c.cell.siteType === 'urban' && c.cell.buildingType === 'box' && c.cell.developmentType === 'reuse');
		expect(urbanBoxReuse?.pattern?.slug).toBe('urban-box-adaptive-reuse');
		expect(cells.filter((c) => c.cell.developmentType === 'existing').every((c) => c.pattern?.slug === 'stewarding-what-you-have')).toBe(true);
	});
});

describe('conditionText', () => {
	it('reads conditions in plain words', () => {
		expect(conditionText({ partnering: ['open'], capacity: ['some_staff', 'staffed'] })).toBe('open to partners; some staff or dedicated staff');
	});
});
