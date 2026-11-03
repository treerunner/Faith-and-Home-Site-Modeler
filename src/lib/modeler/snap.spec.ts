import { describe, it, expect } from 'vitest';
import { snapToGrid, getPartAABB, getPartCorners, snapEdge } from './snap';
import type { Part } from './types';

function makePart(overrides: Partial<Part> = {}): Part {
	return {
		id: 'test',
		shape: 'rect',
		x: 0,
		y: 0,
		w: 10,
		d: 6,
		rotation: 0,
		...overrides,
	};
}

describe('snapToGrid', () => {
	it('snaps to nearest 1m by default', () => {
		expect(snapToGrid(3.4)).toBe(3);
		expect(snapToGrid(3.6)).toBe(4);
		expect(snapToGrid(3.5)).toBe(4);
	});

	it('snaps to 0.5m step', () => {
		expect(snapToGrid(3.2, 0.5)).toBe(3);
		expect(snapToGrid(3.3, 0.5)).toBe(3.5);
		expect(snapToGrid(3.7, 0.5)).toBe(3.5);
		expect(snapToGrid(3.8, 0.5)).toBe(4);
	});

	it('handles negative values', () => {
		expect(snapToGrid(-2.6)).toBe(-3);
		expect(snapToGrid(-2.4)).toBe(-2);
	});
});

describe('getPartAABB', () => {
	it('returns correct AABB for axis-aligned rect', () => {
		const part = makePart({ x: 5, y: 3, w: 10, d: 6, rotation: 0 });
		const aabb = getPartAABB(part);
		expect(aabb.minX).toBeCloseTo(0);
		expect(aabb.maxX).toBeCloseTo(10);
		expect(aabb.minY).toBeCloseTo(0);
		expect(aabb.maxY).toBeCloseTo(6);
	});

	it('expands AABB when part is rotated 45 degrees', () => {
		const part = makePart({ x: 0, y: 0, w: 4, d: 4, rotation: 45 });
		const aabb = getPartAABB(part);
		// Rotated square: diagonal = 4*sqrt(2) ≈ 5.66, so extents ≈ ±2.83
		expect(aabb.maxX).toBeCloseTo(2 * Math.sqrt(2), 1);
		expect(aabb.minX).toBeCloseTo(-2 * Math.sqrt(2), 1);
	});

	it('returns correct AABB for rotated rect at 90 degrees (w and d swap)', () => {
		const part = makePart({ x: 0, y: 0, w: 10, d: 6, rotation: 90 });
		const aabb = getPartAABB(part);
		expect(aabb.maxX).toBeCloseTo(3);
		expect(aabb.minX).toBeCloseTo(-3);
		expect(aabb.maxY).toBeCloseTo(5);
		expect(aabb.minY).toBeCloseTo(-5);
	});
});

describe('getPartCorners', () => {
	it('returns 4 corners for axis-aligned rect', () => {
		const part = makePart({ x: 0, y: 0, w: 4, d: 2, rotation: 0 });
		const corners = getPartCorners(part);
		expect(corners).toHaveLength(4);
		const xs = corners.map((c) => c[0]).sort((a, b) => a - b);
		const ys = corners.map((c) => c[1]).sort((a, b) => a - b);
		expect(xs[0]).toBeCloseTo(-2);
		expect(xs[3]).toBeCloseTo(2);
		expect(ys[0]).toBeCloseTo(-1);
		expect(ys[3]).toBeCloseTo(1);
	});
});

describe('snapEdge', () => {
	it('snaps left edge to right edge of neighbor within threshold', () => {
		const moving = makePart({ id: 'm', x: 5.4, y: 0, w: 4, d: 4 }); // left edge at 3.4
		const neighbor = makePart({ id: 'n', x: -1, y: 0, w: 4, d: 4 }); // right edge at 1
		// left edge 3.4 vs right edge 1 → distance 2.4 > threshold, no snap
		const result = snapEdge(moving, [moving, neighbor]);
		expect(result.x).toBe(moving.x);
	});

	it('snaps when within threshold', () => {
		const moving = makePart({ id: 'm', x: 5.3, y: 0, w: 4, d: 4 }); // left edge 3.3, right edge 7.3
		const neighbor = makePart({ id: 'n', x: 2, y: 0, w: 6, d: 4 }); // right edge 5
		// right edge 7.3 vs right edge 5 → distance 2.3 > threshold
		// left edge 3.3 vs right edge 5 → distance 1.7 > threshold
		// Still outside default threshold (0.75)
		const result = snapEdge(moving, [moving, neighbor]);
		expect(result.x).toBe(moving.x);
	});

	it('snaps left-to-right edge when very close', () => {
		// moving right edge at 5.6, neighbor left edge at 5 — distance 0.6 < 0.75
		const moving = makePart({ id: 'm', x: 3.6, y: 0, w: 4, d: 4 }); // right edge at 5.6
		const neighbor = makePart({ id: 'n', x: 8, y: 0, w: 6, d: 4 }); // left edge at 5
		const result = snapEdge(moving, [moving, neighbor]);
		// right edge should snap to left edge of neighbor (5)
		// new x = 5 - 4/2 = 3
		expect(result.x).toBeCloseTo(3);
	});

	it('skips self when computing snap', () => {
		const part = makePart({ id: 'm', x: 0, y: 0, w: 4, d: 4 });
		const result = snapEdge(part, [part]);
		expect(result.x).toBe(part.x);
		expect(result.y).toBe(part.y);
	});
});
