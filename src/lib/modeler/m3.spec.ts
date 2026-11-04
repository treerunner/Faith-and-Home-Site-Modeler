import { describe, it, expect } from 'vitest';
import { partTotalHeight, roofHeight, gableRidgeAxis } from './geometry';
import { store } from './store.svelte';
import type { Part, Structure } from './types';

function makePart(overrides: Partial<Part> = {}): Part {
	return { id: 'p1', shape: 'rect', x: 0, y: 0, w: 10, d: 6, rotation: 0, ...overrides };
}

function makeStructure(overrides: Partial<Structure> = {}): Structure {
	return {
		id: 's1',
		label: 'Test',
		status: 'existing',
		uses: [],
		stories: 2,
		floorHeight: 3.5,
		roof: 'flat',
		parts: [],
		provenance: 'user',
		...overrides,
	};
}

describe('partTotalHeight', () => {
	it('multiplies stories by floorHeight', () => {
		expect(partTotalHeight(makeStructure({ stories: 2, floorHeight: 3.5 }))).toBe(7);
		expect(partTotalHeight(makeStructure({ stories: 1, floorHeight: 9 }))).toBe(9);
		expect(partTotalHeight(makeStructure({ stories: 3, floorHeight: 3.5 }))).toBeCloseTo(10.5);
	});
});

describe('roofHeight', () => {
	it('is 0.4 × min(w, d)', () => {
		expect(roofHeight(makePart({ w: 10, d: 6 }))).toBeCloseTo(2.4);
		expect(roofHeight(makePart({ w: 6, d: 10 }))).toBeCloseTo(2.4);
		expect(roofHeight(makePart({ w: 6, d: 6 }))).toBeCloseTo(2.4);
		expect(roofHeight(makePart({ w: 10, d: 10 }))).toBeCloseTo(4);
	});
});

describe('gableRidgeAxis', () => {
	it('returns x when w >= d', () => {
		expect(gableRidgeAxis(makePart({ w: 10, d: 6 }))).toBe('x');
		expect(gableRidgeAxis(makePart({ w: 6, d: 6 }))).toBe('x');
	});

	it('returns z when d > w', () => {
		expect(gableRidgeAxis(makePart({ w: 6, d: 10 }))).toBe('z');
	});
});

describe('store.viewMode', () => {
	it('starts in plan mode', () => {
		expect(store.viewMode).toBe('plan');
	});

	it('toggles between plan and 3d', () => {
		store.viewMode = 'plan';
		store.toggleViewMode();
		expect(store.viewMode).toBe('3d');
		store.toggleViewMode();
		expect(store.viewMode).toBe('plan');
	});
});
