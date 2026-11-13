import { describe, it, expect } from 'vitest';
import { baseOf, contourInterval, drapeLine, drapeTriangles, terrainModel, type Band } from './terrain';
import type { Terrain } from './types';

type Pt = [number, number];

// A grid of heights from a function of local x (east) and y (south), on a board of half-width `half`
function grid(half: number, spacing: number, f: (x: number, y: number) => number): Terrain {
	const n = Math.round((2 * half) / spacing) + 1;
	const heights: number[] = [];
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(Math.round(f(-half + j * spacing, -half + i * spacing) * 10) / 10);
	return { spacing, heights };
}

const area = (poly: Pt[]) => Math.abs(poly.reduce((a, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return a + x1 * y2 - x2 * y1; }, 0) / 2);
const sumArea = (bands: Band[]) => bands.reduce((a, b) => a + area(b.polygon), 0);

// Rising 1 m every 10 m to the south: 20 m of relief on a 200 m board
const slope = grid(100, 5, (_x, y) => 100 + y / 10);

describe('contourInterval', () => {
	it('picks the finest interval that keeps the board to 15 layers', () => {
		expect(contourInterval([100, 106])).toBe(0.5); // 12 layers
		expect(contourInterval([100, 110])).toBe(1);
		expect(contourInterval([100, 120])).toBe(2);
		expect(contourInterval([100, 160])).toBe(5);
		expect(contourInterval([100, 190])).toBe(5); // steeper than any: the coarsest
	});

	it('leaves an about flat board flat', () => {
		expect(contourInterval([100, 100.3])).toBeNull();
		expect(terrainModel(grid(100, 5, () => 100), 100)).toBeNull();
	});
});

describe('terrainModel', () => {
	const m = terrainModel(slope, 100)!;

	it('puts the layer under the origin at zero', () => {
		expect(m.interval).toBe(2);
		expect(m.stepAt(0, 0)).toBe(0);
		expect(m.heightAt(0, 0)).toBeCloseTo(0);
		expect(m.stepAt(0, 25)).toBe(2); // 2.5 m higher: one 2 m layer up
		expect(m.stepAt(0, -25)).toBe(-4); // 2.5 m lower: on the layer two down
		expect(m.minY).toBe(-10);
		expect(m.maxY).toBe(10);
	});

	it('covers the board exactly once with layer tops', () => {
		expect(sumArea(m.bands)).toBeCloseTo(200 * 200, 3);
	});

	it('draws contours at their levels, across the board', () => {
		const at4 = m.contours.filter((c) => c.y === 4);
		// The 4 m contour runs east-west at y = 40, 200 m long
		for (const c of at4) {
			expect(c.a[1]).toBeCloseTo(40);
			expect(c.b[1]).toBeCloseTo(40);
		}
		expect(at4.reduce((a, c) => a + Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]), 0)).toBeCloseTo(200);
	});

	it('marks every fifth contour as an index line', () => {
		// 2 m interval with the zero layer at 100 m: index lines at 100 m and 110 m. The board's
		// lowest edge is 90 m, which has no contour above it.
		expect(new Set(m.contours.filter((c) => c.index).map((c) => c.y))).toEqual(new Set([0, 10]));
	});

	it('steps the board sides', () => {
		// The east side rises from -10 to 10: walls at each of the 10 layers above the lowest
		const east = m.edges.filter((e) => e.a[0] === 100 && e.b[0] === 100);
		expect(new Set(east.map((e) => e.y)).size).toBe(10);
	});

	it('handles a peak in the middle', () => {
		const pyramid = terrainModel(grid(50, 5, (x, y) => 120 - Math.max(Math.abs(x), Math.abs(y)) / 5), 50)!;
		expect(pyramid.stepAt(0, 0)).toBe(0);
		expect(pyramid.stepAt(45, 0)).toBeLessThan(pyramid.stepAt(20, 0));
		expect(sumArea(pyramid.bands)).toBeCloseTo(100 * 100, 3);
		// Every contour closes a loop around the peak: each end point is shared with another contour
		const key = ([x, y]: Pt) => `${x.toFixed(6)},${y.toFixed(6)}`;
		const ends = new Map<string, number>();
		for (const c of pyramid.contours) for (const p of [c.a, c.b]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1);
		for (const count of ends.values()) expect(count).toBe(2);
	});
});

describe('baseOf', () => {
	const m = terrainModel(slope, 100)!;

	it('sits a footprint on the lowest layer under it', () => {
		// 0 m to 30 m south: the ground rises 3 m; the base stays on the lowest layer
		expect(baseOf(m, [[-10, 0], [10, 0], [10, 30], [-10, 30]])).toBe(0);
		expect(baseOf(m, [[-10, 22], [10, 22], [10, 30], [-10, 30]])).toBe(2);
	});

	it('finds a hollow inside a large footprint', () => {
		const bowl = terrainModel(grid(100, 5, (x, y) => (Math.abs(x) < 6 && Math.abs(y) < 6 ? 95 : 105 + y / 50)), 100)!;
		expect(baseOf(bowl, [[-30, -30], [30, -30], [30, 30], [-30, 30]])).toBe(bowl.stepAt(0, 0));
	});
});

describe('drape', () => {
	const m = terrainModel(slope, 100)!;

	it('splits a flat shape into pieces, one per layer, keeping its area', () => {
		const tris: [Pt, Pt, Pt][] = [[[0, 0], [20, 0], [20, 30]], [[0, 0], [20, 30], [0, 30]]];
		const pieces = drapeTriangles(m, tris);
		expect(sumArea(pieces)).toBeCloseTo(600, 3);
		// Each piece's center lies on its own layer
		for (const p of pieces) {
			const cx = p.polygon.reduce((a, q) => a + q[0], 0) / p.polygon.length;
			const cy = p.polygon.reduce((a, q) => a + q[1], 0) / p.polygon.length;
			expect(m.stepAt(cx, cy)).toBe(p.y);
		}
		expect(new Set(pieces.map((p) => p.y))).toEqual(new Set([0, 2]));
	});

	it('splits a line where it crosses layers', () => {
		const segs = drapeLine(m, [[0, -5], [0, 45]]);
		expect(segs.reduce((a, s) => a + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), 0)).toBeCloseTo(50, 3);
		expect(new Set(segs.map((s) => s.y))).toEqual(new Set([-2, 0, 2, 4]));
	});
});

describe('on real ground', async () => {
	// The 3DEP fixture, resampled as the server does: about 20 m of relief on a 300 m board
	const { default: fixture } = await import('../server/fixtures/usgs-3dep.json');
	const { parseGeoTiff } = await import('../server/tiff');
	const { terrainFromRaster } = await import('../server/elevation');
	const bytes = Uint8Array.from(atob(fixture.tiffBase64), (c) => c.charCodeAt(0));
	const terrain = terrainFromRaster(parseGeoTiff(bytes.buffer), fixture.origin, 150)!;

	it('builds layers quickly and covers the board', () => {
		const t = performance.now();
		const m = terrainModel(terrain, 150)!;
		expect(performance.now() - t).toBeLessThan(200);
		expect(m.interval).toBe(2);
		expect(sumArea(m.bands)).toBeCloseTo(300 * 300, 1);
		expect(m.bands.length).toBeLessThan(20_000);
	});
});
