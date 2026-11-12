import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';

function placeStructure(status: 'existing' | 'adaptive_reuse' | 'new' | 'removed', x = 0) {
	store.placePart('square', x, 0);
	const s = store.plan.structures.at(-1)!;
	store.updateStructure(s.id, { status });
}

describe('store plans', () => {
	beforeEach(() => store.newSite());

	it('starts a new site with one plan, Existing conditions', () => {
		expect(store.site.plans).toHaveLength(1);
		expect(store.plan).toMatchObject({ name: 'Existing conditions', slug: 'existing-conditions' });
	});

	it('New plan keeps standing buildings as existing and drops proposed ones', () => {
		placeStructure('existing', 0);
		placeStructure('adaptive_reuse', 20);
		placeStructure('removed', 40);
		placeStructure('new', 60);
		store.addOpenSpace('lawn', [[0, 0], [5, 0], [5, 5]]);
		const first = store.plan.id;

		store.newPlan();
		expect(store.site.plans).toHaveLength(2);
		expect(store.plan.id).not.toBe(first);
		expect(store.plan).toMatchObject({ name: 'New plan', slug: 'new-plan' });
		expect(store.plan.structures.map((s) => s.status)).toEqual(['existing', 'existing', 'existing']);
		expect(store.plan.openSpaces).toHaveLength(1);
	});

	it('edits apply only to the active plan', () => {
		placeStructure('existing');
		store.duplicatePlan();
		expect(store.plan).toMatchObject({ name: 'Existing conditions copy', slug: 'existing-conditions-copy' });
		placeStructure('new', 30);
		expect(store.plan.structures).toHaveLength(2);
		store.switchPlan(store.site.plans[0].id);
		expect(store.plan.structures).toHaveLength(1);
	});

	it('switching plans clears undo so history never crosses plans', () => {
		placeStructure('existing');
		store.duplicatePlan();
		store.switchPlan(store.site.plans[0].id);
		store.undo();
		expect(store.plan.structures).toHaveLength(1);
		expect(store.site.plans).toHaveLength(2);
	});

	it('renaming is undoable', () => {
		store.renamePlan('Housing on the lot');
		expect(store.plan.name).toBe('Housing on the lot');
		store.undo();
		expect(store.plan.name).toBe('Existing conditions');
	});

	it('deletes a plan but never the last one', () => {
		store.duplicatePlan();
		const copy = store.plan.id;
		store.deletePlan(copy);
		expect(store.site.plans).toHaveLength(1);
		expect(store.plan.name).toBe('Existing conditions');
		store.deletePlan(store.plan.id);
		expect(store.site.plans).toHaveLength(1);
	});

	it('stays on the current plan when deleting another', () => {
		store.duplicatePlan();
		const copy = store.plan.id;
		store.deletePlan(store.site.plans[0].id);
		expect(store.plan.id).toBe(copy);
	});
});
