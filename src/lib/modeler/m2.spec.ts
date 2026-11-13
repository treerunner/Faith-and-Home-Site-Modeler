import { describe, it, expect, beforeEach } from 'vitest';
import { statusColor } from './colors';
import type { Status } from './types';

// ── statusColor ──────────────────────────────────────────────────────────────

describe('statusColor', () => {
	const cases: [Status, string][] = [
		['existing', '#959192'],
		['new', '#f7941d'],
		['removed', '#dfdede'],
	];

	for (const [status, expected] of cases) {
		it(`maps '${status}' to '${expected}'`, () => {
			expect(statusColor(status)).toBe(expected);
		});
	}
});

// ── Store — structure methods ────────────────────────────────────────────────
// The store is a singleton with shared state, so we test via its public API
// and reset between tests via undo-stack isolation (addStructure pushes undo).

import { store } from './store.svelte';

function resetStore() {
	store.newSite(); // one empty plan, idle mode, no history
}

describe('store.addStructure', () => {
	beforeEach(resetStore);

	it('creates a new structure and sets it active', () => {
		store.addStructure();
		expect(store.plan.structures.length).toBe(1);
		expect(store.activeStructureId).toBe(store.plan.structures[0].id);
	});
});

describe('store.updateStructure', () => {
	beforeEach(() => { resetStore(); store.addStructure(); });

	it('mutates label', () => {
		const id = store.plan.structures[0].id;
		store.updateStructure(id, { label: 'Sanctuary' });
		expect(store.plan.structures[0].label).toBe('Sanctuary');
	});

	it('mutates status', () => {
		const id = store.plan.structures[0].id;
		store.updateStructure(id, { status: 'new' });
		expect(store.plan.structures[0].status).toBe('new');
	});

	it('mutates uses', () => {
		const id = store.plan.structures[0].id;
		store.updateStructure(id, { uses: ['worship', 'education'] });
		expect(store.plan.structures[0].uses).toEqual(['worship', 'education']);
	});

	it('does not affect other structures', () => {
		store.addStructure();
		const second = store.plan.structures[1];
		second.label = 'Second';
		const first = store.plan.structures[0];
		store.updateStructure(first.id, { label: 'First updated' });
		expect(store.plan.structures[1].label).toBe('Second');
		expect(store.plan.structures[0].label).toBe('First updated');
	});
});

describe('store.deleteStructure', () => {
	beforeEach(resetStore);

	it('removes the structure and its parts', () => {
		store.addStructure();
		const s = store.plan.structures[0];
		const partId = crypto.randomUUID();
		s.parts.push({ id: partId, shape: 'rect', x: 0, y: 0, w: 10, d: 6, rotation: 0 });
		store.deleteStructure(s.id);
		expect(store.plan.structures.length).toBe(0);
	});

	it('can delete down to an empty list', () => {
		store.addStructure();
		store.addStructure();
		store.deleteStructure(store.plan.structures[0].id);
		store.deleteStructure(store.plan.structures[0].id);
		expect(store.plan.structures.length).toBe(0);
	});
});

describe('store.addOpenSpace / deleteOpenSpace', () => {
	beforeEach(resetStore);

	it('adds an open space', () => {
		store.addOpenSpace('lawn', [[0, 0], [10, 0], [10, 10], [0, 10]]);
		expect(store.plan.openSpaces.length).toBe(1);
		expect(store.plan.openSpaces[0].kind).toBe('lawn');
	});

	it('deletes an open space', () => {
		store.addOpenSpace('parking', [[0, 0], [5, 0], [5, 5]]);
		const id = store.plan.openSpaces[0].id;
		store.deleteOpenSpace(id);
		expect(store.plan.openSpaces.length).toBe(0);
	});
});

describe('store.addOpenSpaceVertex', () => {
	beforeEach(resetStore);

	it('accumulates points and does not close until 3+ points and within 2m', () => {
		store.startDrawingOpenSpace('courtyard');
		store.addOpenSpaceVertex(0, 0);
		store.addOpenSpaceVertex(10, 0);
		expect(store.mode.type).toBe('drawingOpenSpace');
		if (store.mode.type === 'drawingOpenSpace') {
			expect(store.mode.points.length).toBe(2);
		}
	});

	it('closes polygon when clicking near start with 3+ points', () => {
		store.startDrawingOpenSpace('garden');
		store.addOpenSpaceVertex(0, 0);
		store.addOpenSpaceVertex(10, 0);
		store.addOpenSpaceVertex(10, 10);
		// Click within 2m of start
		store.addOpenSpaceVertex(0.5, 0.5);
		expect(store.mode.type).toBe('idle');
		expect(store.plan.openSpaces.length).toBe(1);
	});
});
