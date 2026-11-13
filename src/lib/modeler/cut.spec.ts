import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { partFootprint } from './metrics';

// A 30 x 10 m building centered on the origin, with properties worth carrying to the pieces
function placeBuilding() {
	store.placePart('rect', 0, 0);
	const s = store.plan.structures.at(-1)!;
	s.parts[0].w = 30;
	s.parts[0].d = 10;
	store.updateStructure(s.id, { label: 'Redeemer', status: 'adaptive_reuse', uses: ['worship'], stories: 2, roof: 'gable', dwellings: 4 });
	return s.id;
}

describe('cutting a structure', () => {
	beforeEach(() => store.newSite());

	it('splits it into grouped structures that keep its properties', () => {
		const id = placeBuilding();
		const kept = store.cutStructure(id, [5, -20], [5, 20]); // 20 m and 10 m pieces
		expect(kept).not.toBeNull();

		const [original, piece] = store.plan.structures;
		expect(store.plan.structures).toHaveLength(2);
		expect(original.id).toBe(id);
		expect(original.label).toBe('Redeemer');
		expect(piece.label).toBe('Redeemer 2');
		// The largest piece stays with the original
		expect(partFootprint(original.parts[0])).toBeCloseTo(200, 0);
		expect(partFootprint(piece.parts[0])).toBeCloseTo(100, 0);
		// Same building: one group, same properties; dwellings counted once
		expect(original.groupId).toBeDefined();
		expect(piece.groupId).toBe(original.groupId);
		expect(piece).toMatchObject({ status: 'adaptive_reuse', uses: ['worship'], stories: 2, roof: 'gable' });
		expect(original.dwellings).toBe(4);
		expect(piece.dwellings).toBeUndefined();
	});

	it('cuts in two clicks and selects the kept piece', () => {
		const id = placeBuilding();
		store.startCutting(id);
		store.addCutPoint(-5, -20);
		expect(store.mode).toMatchObject({ type: 'cutting', start: [-5, -20] });
		store.addCutPoint(-5, 20);
		expect(store.mode.type).toBe('selected');
		expect(store.plan.structures).toHaveLength(2);
	});

	it('reports a line that misses and changes nothing', () => {
		const id = placeBuilding();
		store.startCutting(id);
		store.addCutPoint(40, -20);
		store.addCutPoint(40, 20);
		expect(store.mode).toMatchObject({ type: 'cutting', missed: true });
		expect(store.plan.structures).toHaveLength(1);
	});

	it('falls back to a flat roof for irregular pieces', () => {
		const id = placeBuilding();
		store.cutStructure(id, [-20, -20], [20, 15]); // a diagonal leaves non-rectangular pieces
		for (const s of store.plan.structures) {
			const rectangular = s.parts.every((p) => p.shape === 'rect');
			expect(s.roof).toBe(rectangular ? 'gable' : 'flat');
		}
	});

	it('undoes in one step', () => {
		const id = placeBuilding();
		store.cutStructure(id, [5, -20], [5, 20]);
		store.undo();
		expect(store.plan.structures).toHaveLength(1);
		expect(store.plan.structures[0].parts[0].w).toBe(30);
		expect(store.plan.structures[0].groupId).toBeUndefined();
	});
});
