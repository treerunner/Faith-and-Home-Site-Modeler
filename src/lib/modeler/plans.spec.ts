import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { storedSite } from './existing';
import { normalizeSite } from './serialize';
import { grossFloorArea, inferDevelopmentType } from './metrics';

// A building on the site view; returns its id
function placeExisting(x = 0) {
	store.placePart('square', x, 0);
	return store.plan.structures.at(-1)!.id;
}

const site = () => store.site.existing.id;
const inPlan = (id: string) => store.plan.structures.find((s) => s.id === id)!;

describe('store plans', () => {
	beforeEach(() => store.newSite());

	it('starts a new site on the site view, with no plans', () => {
		expect(store.site.plans).toHaveLength(0);
		expect(store.onSite).toBe(true);
		expect(store.plan).toBe(store.site.existing);
		expect(store.plan.name).toBe('Existing conditions');
	});

	it('New plan starts from existing conditions, with copies of open spaces and trees', () => {
		placeExisting(0);
		store.addOpenSpace('lawn', [[0, 0], [5, 0], [5, 5]]);
		store.newPlan();
		expect(store.site.plans).toHaveLength(1);
		expect(store.onSite).toBe(false);
		expect(store.plan).toMatchObject({ name: 'New plan', slug: 'new-plan' });
		expect(store.plan.structures.map((s) => s.status)).toEqual(['existing']);
		expect(store.plan.openSpaces).toHaveLength(1);
		// Open spaces are the plan's own from here
		store.deleteOpenSpace(store.plan.openSpaces[0].id);
		expect(store.site.existing.openSpaces).toHaveLength(1);
	});

	it('a plan draws new buildings and only decides what happens to the site\'s', () => {
		const id = placeExisting();
		store.newPlan();
		store.placePart('square', 30, 0);
		expect(store.plan.structures.at(-1)!.status).toBe('new');

		const part = inPlan(id).parts[0];
		const before = { ...part };
		store.startDragging(part.id, 0, 0);
		store.updateDrag(20, 20);
		store.endDrag();
		store.startResizing(part.id, 'se');
		store.rotatePart(part.id, 15);
		store.deletePart(part.id);
		store.updateStructure(id, { label: 'Moved', stories: 5, uses: ['housing'] });
		expect(inPlan(id).parts[0]).toMatchObject({ x: before.x, y: before.y, w: before.w, rotation: before.rotation });
		expect(inPlan(id)).toMatchObject({ label: 'Structure', stories: 1, uses: [] });

		store.updateStructure(id, { status: 'removed' });
		expect(inPlan(id).status).toBe('removed');
		store.updateStructure(id, { status: 'existing', addedStories: 2, roof: 'gable' });
		expect(inPlan(id)).toMatchObject({ status: 'existing', addedStories: 2, roof: 'gable', planRoof: 'gable' });
	});

	it('picks up changes made on the site, keeping its choices', () => {
		const id = placeExisting();
		store.newPlan();
		const plan = store.plan.id;
		store.updateStructure(id, { addedStories: 1 });
		store.switchPlan(site());
		store.updateStructure(id, { stories: 3, label: 'Hall' });
		store.switchPlan(plan);
		expect(inPlan(id)).toMatchObject({ stories: 3, label: 'Hall', addedStories: 1 });
	});

	it('drops a plan\'s choices on a building the site deletes', () => {
		const id = placeExisting();
		store.newPlan();
		const plan = store.plan.id;
		store.updateStructure(id, { status: 'removed' });
		store.switchPlan(site());
		store.deleteStructure(id);
		store.switchPlan(plan);
		expect(store.plan.structures).toHaveLength(0);
	});

	it('carries a plan\'s choices to every piece when the site cuts or splits a building', () => {
		store.placePart('rect', 0, 0);
		const id = store.plan.structures[0].id;
		store.plan.structures[0].parts[0].w = 20;
		store.newPlan();
		const plan = store.plan.id;
		store.updateStructure(id, { status: 'removed' });
		store.switchPlan(site());
		store.cutStructure(id, [5, -20], [5, 20]);
		const pieceId = store.plan.structures[1].id;
		store.switchPlan(plan);
		expect(store.plan.structures.map((s) => [s.id, s.status])).toEqual([[id, 'removed'], [pieceId, 'removed']]);
		expect(store.cutStructure(id, [0, -20], [0, 20])).toBeNull();
	});

	it('counts added stories as new floor area and new development', () => {
		const id = placeExisting();
		store.newPlan();
		const gfa = grossFloorArea(store.plan);
		expect(inferDevelopmentType(store.plan)).toBe('existing');
		store.updateStructure(id, { addedStories: 1 });
		expect(grossFloorArea(store.plan)).toBeCloseTo(gfa * 2);
		expect(inferDevelopmentType(store.plan)).toBe('new');
	});

	it('saves only a plan\'s own buildings and its choices, and loads them back', () => {
		const id = placeExisting();
		store.newPlan();
		store.placePart('square', 30, 0);
		store.updateStructure(id, { status: 'removed' });
		const stored = storedSite(JSON.parse(JSON.stringify(store.site)));
		expect(stored.plans[0].structures.map((s) => s.status)).toEqual(['new']);
		expect(stored.plans[0].existingChoices).toEqual({ [id]: { removed: true } });
		const loaded = normalizeSite(JSON.parse(JSON.stringify(stored)));
		expect(loaded.plans[0].structures.map((s) => [s.id === id, s.status])).toEqual([[true, 'removed'], [false, 'new']]);
	});

	it('duplicates a plan, and from the site view starts a fresh one', () => {
		const id = placeExisting();
		store.duplicatePlan();
		expect(store.plan.name).toBe('New plan');
		store.updateStructure(id, { status: 'removed' });
		store.duplicatePlan();
		expect(store.plan.name).toBe('New plan copy');
		expect(inPlan(id).status).toBe('removed');
	});

	it('switching clears undo so history never crosses plans', () => {
		placeExisting();
		store.newPlan();
		store.switchPlan(site());
		store.undo();
		expect(store.plan.structures).toHaveLength(1);
		expect(store.site.plans).toHaveLength(1);
	});

	it('renames plans, undoably, but not existing conditions', () => {
		store.renamePlan('Housing');
		expect(store.plan.name).toBe('Existing conditions');
		store.newPlan();
		store.renamePlan('Housing on the lot');
		expect(store.plan.name).toBe('Housing on the lot');
		store.undo();
		expect(store.plan.name).toBe('New plan');
	});

	it('deletes plans, going back to the site view after the last', () => {
		store.newPlan();
		const first = store.plan.id;
		store.newPlan();
		const second = store.plan.id;
		store.deletePlan(first);
		expect(store.plan.id).toBe(second);
		store.deletePlan(second);
		expect(store.site.plans).toHaveLength(0);
		expect(store.onSite).toBe(true);
		store.deletePlan(site());
		expect(store.site.existing).toBeDefined();
	});
});
