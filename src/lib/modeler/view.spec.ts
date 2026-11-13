import { describe, it, expect } from 'vitest';
import { cameraFloor, CAMERA_CLEARANCE, zoomAbout, ZOOM_LIMITS, contentBounds, fitView, maxViewHeight, panBy, scaleBar, zoomAt, DEFAULT_VIEW } from './view';
import { ftToM } from './units';

const HALF = 150; // default address board
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
		const v = fitView({ minX: 0, maxX: 40, minY: -100, maxY: 0 }, 1.5, HALF);
		expect(v.center).toEqual([20, -50]);
		expect(v.height).toBeCloseTo(120); // tall content: 100 m × 1.2
	});

	it('fits wide content by width', () => {
		const v = fitView({ minX: -100, maxX: 100, minY: 0, maxY: 10 }, 2, HALF);
		expect(v.height).toBeCloseTo(120); // 200 m wide / aspect 2 × 1.2
	});

	it('falls back to the default and caps the height', () => {
		expect(fitView(null, 1.5, HALF)).toEqual(DEFAULT_VIEW);
		expect(fitView({ minX: 0, maxX: 2000, minY: 0, maxY: 2000 }, 1, HALF).height).toBe(maxViewHeight(HALF));
	});
});

describe('zoomAt', () => {
	it('keeps the point under the cursor fixed', () => {
		const v = zoomAt({ center: [0, 0], height: 100 }, 2, [10, 20], HALF);
		expect(v.height).toBe(200);
		// The cursor point stays at the same fraction of the view
		expect((10 - v.center[0]) / v.height).toBeCloseTo((10 - 0) / 100);
		expect((20 - v.center[1]) / v.height).toBeCloseTo((20 - 0) / 100);
	});

	it('does not move the view when zoom is already at a limit', () => {
		const v = zoomAt({ center: [5, 5], height: maxViewHeight(HALF) }, 2, [50, 50], HALF);
		expect(v).toEqual({ center: [5, 5], height: maxViewHeight(HALF) });
	});
});

describe('panBy', () => {
	it('moves content with the pointer', () => {
		// 100 m over 500 px = 0.2 m per pixel. Dragging right by 50 px shows what was 10 m left.
		const v = panBy({ center: [0, 0], height: 100 }, 50, -25, 500, HALF);
		expect(v.center[0]).toBeCloseTo(-10);
		expect(v.center[1]).toBeCloseTo(5);
	});

	it('keeps the view center on the board', () => {
		expect(panBy({ center: [0, 0], height: 100 }, -100000, 0, 500, HALF).center[0]).toBe(HALF);
		expect(panBy({ center: [0, 0], height: 100 }, 0, 100000, 500, 400).center[1]).toBe(-400);
	});
});

describe('board limits', () => {
	it('lets a bigger board zoom out further', () => {
		expect(zoomAt({ center: [0, 0], height: 300 }, 4, [0, 0], HALF).height).toBe(maxViewHeight(HALF));
		expect(zoomAt({ center: [0, 0], height: 300 }, 2, [0, 0], 400).height).toBe(600);
	});

	it('keeps a fitted view centered on the board', () => {
		expect(fitView({ minX: 500, maxX: 520, minY: 0, maxY: 20 }, 1, HALF).center[0]).toBe(HALF);
	});
});

describe('scaleBar', () => {
	it('picks a round length near a tenth of the view', () => {
		expect(scaleBar(100).feet).toBe(25); // target 32.8 ft
		expect(scaleBar(30).feet).toBe(10);
		expect(scaleBar(660).feet).toBe(200);
	});

	it('sizes the bar to match its label', () => {
		for (const h of [20, 73, 100, 220, 880]) {
			const { feet, fraction } = scaleBar(h);
			expect(fraction * h).toBeCloseTo(ftToM(feet), 6); // the bar is exactly `feet` long
			expect(fraction).toBeGreaterThan(0.05);
			expect(fraction).toBeLessThan(0.2);
		}
	});
});

describe('cameraFloor', () => {
	it('keeps the camera above the flat board', () => {
		expect(cameraFloor(null, 500, -20)).toBe(CAMERA_CLEARANCE);
	});

	it('follows the ground under the camera', () => {
		const slope = { groundAt: (x: number, y: number) => x * 0.1 + y * 0.05 };
		expect(cameraFloor(slope, 100, 40)).toBeCloseTo(10 + 2 + CAMERA_CLEARANCE);
		expect(cameraFloor(slope, -100, 0)).toBeCloseTo(-10 + CAMERA_CLEARANCE);
	});

	it('clears a roof under the camera, but not a hole below the ground', () => {
		expect(cameraFloor(null, 0, 0, 14)).toBe(14 + CAMERA_CLEARANCE);
		expect(cameraFloor(null, 0, 0, -3)).toBe(CAMERA_CLEARANCE);
	});
});

describe('zoomAbout', () => {
	type P3 = [number, number, number];
	const limits = { ...ZOOM_LIMITS, half: 150 };
	const position: P3 = [60, 80, 80], target: P3 = [0, 0, 0], point: P3 = [30, 0, -20];
	const dir = (a: P3, b: P3) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); return [0, 1, 2].map((i) => (b[i] - a[i]) / d); };
	const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

	it('keeps the view direction and the point on the same line of sight', () => {
		const z = zoomAbout(position, target, point, 0.5, limits);
		close(dir(z.position, z.target), dir(position, target));
		close(dir(z.position, point), dir(position, point));
		expect(Math.hypot(...z.position.map((v, i) => v - point[i]))).toBeCloseTo(Math.hypot(...position.map((v, i) => v - point[i])) / 2);
	});

	it('zooming in then out returns to the start', () => {
		const a = zoomAbout(position, target, point, 0.8, limits);
		const b = zoomAbout(a.position, a.target, point, 1 / 0.8, limits);
		close(b.position, position);
		close(b.target, target);
	});

	it('stops short of the point, and no farther than the far limit', () => {
		const inside = zoomAbout(position, target, point, 0.0001, limits);
		expect(Math.hypot(...inside.position.map((v, i) => v - point[i]))).toBeCloseTo(limits.near);
		expect(zoomAbout(inside.position, inside.target, point, 0.5, limits)).toEqual(inside);
		const out = zoomAbout(position, target, target, 1000, limits);
		expect(Math.hypot(...out.position.map((v, i) => v - out.target[i]))).toBeCloseTo(limits.far);
	});

	it('keeps the pivot over the board', () => {
		const z = zoomAbout(position, target, [-400, 0, 0], 0.2, limits);
		expect(z.target[0]).toBe(-150);
		close(dir(z.position, z.target), dir(position, target));
	});
});
