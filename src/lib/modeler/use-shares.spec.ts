import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { storedSite } from './existing';
import { normalizeSite } from './serialize';
import {
	dwellingsByStatus,
	generateActionSteps,
	inferDevelopmentType,
	reuseFloorArea,
	sameMix,
	shareReuse,
	structureFootprint,
	useFloorAreaByUse,
} from './metrics';
import { AVG_UNIT_SQFT, sqmToSqft } from './units';

// A two-story worship building on the site, then a plan; returns its id
function churchInPlan() {
	store.placePart('square', 0, 0);
	const id = store.plan.structures.at(-1)!.id;
	store.updateStructure(id, { uses: ['worship'], useWeights: { worship: 50 }, stories: 2 });
	store.newPlan();
	return id;
}

const inPlan = (id: string) => store.plan.structures.find((s) => s.id === id)!;
const onSite = (id: string) => store.site.existing.structures.find((s) => s.id === id)!;

describe('use shares in plans', () => {
	beforeEach(() => store.newSite());

	it('a plan changes a standing building\'s mix without touching the site\'s', () => {
		const id = churchInPlan();
		store.updateStructure(id, { uses: ['worship', 'housing'], useWeights: { worship: 60, housing: 40 } });
		expect(inPlan(id).planUses).toEqual(['worship', 'housing']);
		expect(inPlan(id).uses).toEqual(['worship']);
		expect(onSite(id).uses).toEqual(['worship']);
		expect(onSite(id).planUses).toBeUndefined();
	});

	it('what a use gains over the site\'s share is adaptive reuse, on the building\'s own floors', () => {
		const id = churchInPlan();
		store.updateStructure(id, { uses: ['worship', 'housing'], useWeights: { worship: 60, housing: 40 } });
		const s = inPlan(id);
		const own = structureFootprint(s) * 2;
		expect(shareReuse(s).housing).toBeCloseTo(own * 0.4);
		expect(shareReuse(s).worship).toBeUndefined();
		expect(reuseFloorArea(store.plan)).toBeCloseTo(own * 0.4);
		expect(useFloorAreaByUse(store.plan).housing).toBeCloseTo(own * 0.4);
		expect(useFloorAreaByUse(store.plan).worship).toBeCloseTo(own * 0.6);
		expect(inferDevelopmentType(store.plan)).toBe('reuse');
		const units = Math.floor(sqmToSqft(own * 0.4) / AVG_UNIT_SQFT);
		expect(dwellingsByStatus(store.plan).adaptive_reuse).toBe(units);
	});

	it('floors a plan adds take its mix as new construction, not reuse', () => {
		const id = churchInPlan();
		store.updateStructure(id, { uses: ['worship', 'housing'], useWeights: { worship: 50, housing: 50 } });
		store.updateStructure(id, { addedStories: 2 });
		const s = inPlan(id);
		const fp = structureFootprint(s);
		expect(shareReuse(s).housing).toBeCloseTo(fp * 2 * 0.5);
		expect(useFloorAreaByUse(store.plan).housing).toBeCloseTo(fp * 4 * 0.5);
		expect(inferDevelopmentType(store.plan)).toBe('reuse_new');
	});

	it('a building to be removed reuses nothing and drops its mix', () => {
		const id = churchInPlan();
		store.updateStructure(id, { uses: ['housing'], useWeights: { housing: 50 } });
		store.updateStructure(id, { status: 'removed' });
		expect(inPlan(id).planUses).toBeUndefined();
		expect(reuseFloorArea(store.plan)).toBe(0);
		// and a removed building's uses can't be changed
		store.updateStructure(id, { uses: ['housing'] });
		expect(inPlan(id).planUses).toBeUndefined();
	});

	it('a mix the same as the site\'s clears itself, and Reset goes back to the site\'s', () => {
		const id = churchInPlan();
		store.updateStructure(id, { uses: ['worship', 'housing'], useWeights: { worship: 50, housing: 50 } });
		store.updateStructure(id, { uses: ['worship'], useWeights: { worship: 80 } });
		expect(inPlan(id).planUses).toBeUndefined();
		store.updateStructure(id, { uses: ['worship', 'housing'], useWeights: { worship: 50, housing: 50 } });
		store.resetUses(id);
		expect(inPlan(id).planUses).toBeUndefined();
		store.undo();
		expect(inPlan(id).planUses).toEqual(['worship', 'housing']);
	});

	it('the plan\'s mix is saved as a choice and survives a reload; the site keeps its own', () => {
		const id = churchInPlan();
		store.updateStructure(id, { uses: ['worship', 'housing'], useWeights: { worship: 60, housing: 40 } });
		const stored = storedSite(store.site);
		expect(stored.plans[0].existingChoices?.[id]).toMatchObject({ uses: ['worship', 'housing'], useWeights: { worship: 60, housing: 40 } });
		const loaded = normalizeSite(JSON.parse(JSON.stringify(stored)));
		const s = loaded.plans[0].structures.find((s) => s.id === id)!;
		expect(s.planUses).toEqual(['worship', 'housing']);
		expect(s.uses).toEqual(['worship']);
		expect(loaded.existing.structures[0].planUses).toBeUndefined();
	});

	it('changing the mix counts as proposing change', () => {
		const id = churchInPlan();
		const idle = (msg: string) => msg.startsWith('No new construction or adaptive reuse');
		expect(generateActionSteps(store.plan, store.site).some((s) => idle(s.message))).toBe(true);
		store.updateStructure(id, { uses: ['worship', 'housing'] });
		expect(generateActionSteps(store.plan, store.site).some((s) => idle(s.message))).toBe(false);
	});

	it('sameMix compares shares, not raw weights', () => {
		expect(sameMix({ uses: ['worship', 'housing'], weights: { worship: 20, housing: 20 } }, { uses: ['housing', 'worship'], weights: { worship: 50, housing: 50 } })).toBe(true);
		expect(sameMix({ uses: ['worship'], weights: {} }, { uses: ['worship', 'housing'], weights: {} })).toBe(false);
	});
});
