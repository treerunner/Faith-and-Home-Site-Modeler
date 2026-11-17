import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { compareRows, planSummary } from './compare';
import { patternFor, patternForCell, selectVariant, siteCell } from '../patterns/match';
import { SEED_PATTERNS } from '../patterns/seed';

// A worship building on the site and a plan that turns part of it into housing and adds a building
function siteAndPlan() {
	store.placePart('square', 0, 0);
	const church = store.plan.structures.at(-1)!.id;
	store.updateStructure(church, { uses: ['worship'], useWeights: { worship: 50 }, stories: 2 });
	store.newPlan();
	store.updateStructure(church, { uses: ['worship', 'housing'], useWeights: { worship: 50, housing: 50 } });
	store.placePart('square', 30, 0);
	const added = store.plan.structures.at(-1)!.id;
	store.updateStructure(added, { uses: ['housing'], dwellings: 4 });
	return { a: store.site.existing, b: store.plan };
}

const row = (rows: ReturnType<typeof compareRows>, label: string) => rows.find((r) => r.label === label)!;

describe('compare', () => {
	beforeEach(() => store.newSite());

	it('sums up each plan from the metrics', () => {
		const { a, b } = siteAndPlan();
		const sa = planSummary(a, store.site), sb = planSummary(b, store.site);
		expect(sa.developmentType).toBe('Existing conditions');
		expect(sb.developmentType).toBe('Reuse + new');
		expect(sa.reuse).toBe(0);
		expect(sb.reuse).toBeGreaterThan(0);
		expect(sb.units).toBe(4 + sb.unitsReuse);
		expect(sb.gfa).toBeGreaterThan(sa.gfa);
	});

	it('marks only what changed, with the change signed', () => {
		const { a, b } = siteAndPlan();
		const rows = compareRows(planSummary(a, store.site), planSummary(b, store.site));
		expect(row(rows, 'Development type')).toMatchObject({ a: 'Existing conditions', b: 'Reuse + new', changed: true, change: '' });
		expect(row(rows, 'New units')).toMatchObject({ a: '0', b: '4', change: '+4', changed: true });
		expect(row(rows, 'Green space')).toMatchObject({ changed: false, change: '' });
		expect(row(rows, 'Gross floor area').change).toMatch(/^\+[\d,]+ sq ft$/);
	});

	it('the same plan on both sides changes nothing', () => {
		const { b } = siteAndPlan();
		const s = planSummary(b, store.site);
		expect(compareRows(s, s).some((r) => r.changed)).toBe(false);
	});

	it('patternFor finds what the analysis did', () => {
		const { b } = siteAndPlan();
		store.site.siteType = 'urban';
		const found = patternFor(store.site, b, SEED_PATTERNS);
		const cell = siteCell(store.site, b);
		expect(found.cell).toEqual(cell);
		const pattern = patternForCell(SEED_PATTERNS, cell as Required<typeof cell>);
		expect(found.pattern?.slug).toBe(pattern?.slug);
		expect(found.variant).toEqual(pattern ? selectVariant(pattern, store.site.congregationProfile) : null);
		expect(found.nearest === null).toBe(pattern !== null);
	});

	it('B is the plan being viewed; swapping and picking keep the two apart', () => {
		const { a, b } = siteAndPlan();
		store.startCompare();
		expect(store.compareA?.id).toBe(a.id);
		expect(store.plan.id).toBe(b.id);
		store.swapCompare();
		expect(store.compareA?.id).toBe(b.id);
		expect(store.plan.id).toBe(a.id);
		// Picking B's plan for A swaps them back
		store.setCompare('a', a.id);
		expect(store.compareA?.id).toBe(a.id);
		expect(store.plan.id).toBe(b.id);
		store.endCompare();
		expect(store.compareA).toBeNull();
	});

	it('from the site view, compares with the first plan', () => {
		const { b } = siteAndPlan();
		store.switchPlan(store.site.existing.id);
		store.startCompare();
		expect(store.compareA?.id).toBe(b.id);
	});
});
