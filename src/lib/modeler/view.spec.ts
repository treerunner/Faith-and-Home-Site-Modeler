import { describe, it, expect } from 'vitest';
import { contentBounds, fitView, panBy, zoomAt, DEFAULT_VIEW, MAX_VIEW_HEIGHT } from './view';
import type { Plan } from './types';

const emptyPlan: Plan = { id: 'p', name: 'P', slug: 'p', structures: [], openSpaces: [], trees: [], annotations: [] };

describe('contentBounds', () => {
	it('is null for an empty site', () => {
		expect(contentBounds(emptyPlan)).toBeNull();
	});

	it('covers the parcel, rotated parts, open spaces and tree canopies', () => {
		const plan: Plan = {
			...emptyPlan,
			structures: [{ id: 's', label: 'S', status: 'existing', uses: [], stories: 1, floorHeight: 3.5, roof: 'flat', provenance: 'user',
				parts: [{ id: 'a', shape: 'rect', x: 0, y: 0, w: 10, d: 2, rotation: 90 }] }],
			openSpaces: [{ id: 'o', kind: 'parking', polygon: [[20, 0], [60, 0], [60, 30]] }],
			trees: [{ id: 't', x: -30, y: 0, radius: 3, height: 8 }],
		};
		const b = contentBounds(plan, [[-10, -40], [10, -40], [10, -20]])!;
		expect(b.minX).toBeCloseTo(-33);
		expect(b.maxX).toBeCloseTo(60);
		expect(b.minY).toBeCloseTo(-40);
		expect(b.maxY).toBeCloseTo(30);
	});
});

describe('fitView', () => {
	it('centers on the content with a margin', () => {
		const v = fitView({ minX: 0, maxX: 40, minY: -100, maxY: 0 }, 1.5);
		expect(v.center).toEqual([20, -50]);
		expect(v.height).toBeCloseTo(120); // tall content: 100 m × 1.2
	});

	it('fits wide content by width', () => {
		const v = fitView({ minX: -100, maxX: 100, minY: 0, maxY: 10 }, 2);
		expect(v.height).toBeCloseTo(120); // 200 m wide / aspect 2 × 1.2
	});

	it('falls back to the default and caps the height', () => {
		expect(fitView(null, 1.5)).toEqual(DEFAULT_VIEW);
		expect(fitView({ minX: 0, maxX: 2000, minY: 0, maxY: 2000 }, 1).height).toBe(MAX_VIEW_HEIGHT);
	});
});

describe('zoomAt', () => {
	it('keeps the point under the cursor fixed', () => {
		const v = zoomAt({ center: [0, 0], height: 100 }, 2, [10, 20]);
		expect(v.height).toBe(200);
		// The cursor point stays at the same fraction of the view
		expect((10 - v.center[0]) / v.height).toBeCloseTo((10 - 0) / 100);
		expect((20 - v.center[1]) / v.height).toBeCloseTo((20 - 0) / 100);
	});

	it('does not move the view when zoom is already at a limit', () => {
		const v = zoomAt({ center: [5, 5], height: MAX_VIEW_HEIGHT }, 2, [50, 50]);
		expect(v).toEqual({ center: [5, 5], height: MAX_VIEW_HEIGHT });
	});
});

describe('panBy', () => {
	it('moves content with the pointer', () => {
		// 100 m over 500 px = 0.2 m per pixel. Dragging right by 50 px shows what was 10 m left.
		const v = panBy({ center: [0, 0], height: 100 }, 50, -25, 500);
		expect(v.center[0]).toBeCloseTo(-10);
		expect(v.center[1]).toBeCloseTo(5);
	});

	it('stays over the ground', () => {
		expect(panBy({ center: [0, 0], height: 100 }, -100000, 0, 500).center[0]).toBe(200);
	});
});
