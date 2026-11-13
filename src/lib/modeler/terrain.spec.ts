import { describe, it, expect } from 'vitest';
import { APRON, baseOf, contourInterval, drapeLine, drapeTriangles, gradedSurface, terrainModel, type GradedSurface } from './terrain';
import type { Terrain } from './types';

type Pt = [number, number];
type P3 = [number, number, number];

// A grid of heights from a function of local x (east) and y (south), on a board of half-width `half`
function grid(half: number, spacing: number, f: (x: number, y: number) => number): Terrain {
	const n = Math.round((2 * half) / spacing) + 1;
	const heights: number[] = [];
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(Math.round(f(-half + j * spacing, -half + i * spacing) * 10) / 10);
	return { spacing, heights };
}

const area = (poly: Pt[]) => Math.abs(poly.reduce((a, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return a + x1 * y2 - x2 * y1; }, 0) / 2);
const rect = (x: number, y: number, w: number, d: number): Pt[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];

// Rising 1 m every 10 m to the south: 20 m of relief on a 200 m board, 0 at the origin
const slope = grid(100, 5, (_x, y) => 100 + y / 10);

// Mesh triangles in site coordinates, from the scene buffer (x, up, z)
function meshTriangles(s: GradedSurface): P3[][] {
	const out: P3[][] = [];
	for (let i = 0; i < s.positions.length; i += 9) {
		const p = s.positions;
		out.push([0, 3, 6].map((o) => [p[i + o], p[i + o + 2], p[i + o + 1]] as P3));
	}
	return out;
}

describe('contourInterval', () => {
	it('picks the finest interval that keeps the board to 15 contours', () => {
		expect(contourInterval([100, 106])).toBe(0.5);
		expect(contourInterval([100, 110])).toBe(1);
		expect(contourInterval([100, 120])).toBe(2);
		expect(contourInterval([100, 160])).toBe(5);
		expect(contourInterval([100, 190])).toBe(5);
	});

	it('leaves an about flat board flat', () => {
		expect(contourInterval([100, 100.3])).toBeNull();
		expect(terrainModel(grid(100, 5, () => 100), 100)).toBeNull();
	});
});

describe('terrainModel', () => {
	const m = terrainModel(slope, 100)!;

	it('is smooth, with the origin at zero', () => {
		expect(m.interval).toBe(2);
		expect(m.heightAt(0, 0)).toBeCloseTo(0);
		expect(m.heightAt(0, 25)).toBeCloseTo(2.5);
		expect(m.heightAt(13, -33)).toBeCloseTo(-3.3);
	});

	it('draws contours at absolute levels', () => {
		// 2 m interval: 102 m runs east-west at y = 20, the full 200 m
		const at102 = m.contours.filter((c) => Math.abs(c.a[2] - 2) < 1e-6);
		for (const c of at102) expect([c.a[1], c.b[1]]).toEqual([expect.closeTo(20), expect.closeTo(20)]);
		expect(at102.reduce((a, c) => a + Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]), 0)).toBeCloseTo(200);
		// Index lines every 10 m: 90 m is the board's edge, so 100 m and 110 m
		expect(new Set(m.contours.filter((c) => c.index).map((c) => Math.round(c.a[2])))).toEqual(new Set([0, 10]));
	});

	it('bases a footprint on the lowest ground under it, without rounding', () => {
		expect(baseOf(m, rect(-10, 3, 20, 30))).toBeCloseTo(0.3);
		const bowl = terrainModel(grid(100, 5, (x, y) => (Math.abs(x) < 6 && Math.abs(y) < 6 ? 95 : 105 + y / 50)), 100)!;
		expect(baseOf(bowl, rect(-30, -30, 60, 60))).toBeCloseTo(bowl.heightAt(0, 0));
	});
});

describe('gradedSurface', () => {
	const m = terrainModel(slope, 100)!;
	// A church 40 m deep running up the slope, like St. Timothy's: 4 m of fall under it
	const church = rect(-15, -20, 30, 40);
	const s = gradedSurface(m, [[church]]);

	it('grades a pad to the lowest ground under the building', () => {
		expect(s.bases).toEqual([expect.closeTo(-2)]);
		for (const [x, y] of [[0, 0], [-14, -19], [14, 19], [0, 18]] as Pt[]) expect(s.groundAt(x, y)).toBeCloseTo(-2, 5);
	});

	it('returns to the slope across a bank', () => {
		// Uphill (south) of the church: a cut from the pad back up to the slope over APRON m
		expect(s.groundAt(0, 20 + APRON)).toBeCloseTo(m.heightAt(0, 20 + APRON), 5);
		expect(s.groundAt(0, 30)).toBeCloseTo(m.heightAt(0, 30), 5);
		const mid = s.groundAt(0, 20 + APRON / 2);
		expect(mid).toBeGreaterThan(-2);
		expect(mid).toBeLessThan(m.heightAt(0, 20 + APRON / 2));
		// The uphill wall stands clear: the pad is 4 m below the natural ground there
		expect(m.heightAt(0, 20) - s.groundAt(0, 19.5)).toBeGreaterThan(3.9);
	});

	it('lets the nearest footprint win where pads meet', () => {
		const two = gradedSurface(m, [[rect(-20, -40, 10, 10)], [rect(-8, 20, 10, 10)]]);
		expect(two.bases[0]).toBeCloseTo(-4);
		expect(two.bases[1]).toBeCloseTo(2);
		expect(two.groundAt(-15, -35)).toBeCloseTo(-4, 5);
		expect(two.groundAt(-3, 25)).toBeCloseTo(2, 5);
	});

	it('covers the board exactly, facing up, finer only near buildings', () => {
		const tris = meshTriangles(s);
		const total = tris.reduce((a, t) => a + area(t.map((p) => [p[0], p[1]] as Pt)), 0);
		expect(total).toBeCloseTo(200 * 200, 3);
		const plain = gradedSurface(m, []);
		expect(plain.positions.length / 9).toBe(40 * 40 * 2);
		// The church and its bank (x -18 to 18, y -23 to 23) reach 8 x 10 cells; each splits into 10 x 10 squares
		expect(tris.length).toBe((40 * 40 - 80) * 2 + 80 * 200);
		for (const t of tris) {
			const [a, b, c] = t;
			const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
			expect(cross).toBeLessThanOrEqual(0); // clockwise in site coordinates: up in the scene
		}
		for (let i = 1; i < s.normals.length; i += 3) expect(s.normals[i]).toBeGreaterThan(0);
	});

	it('etches contours on the surface, around the pad', () => {
		for (const c of s.contours) {
			for (const p of [c.a, c.b]) expect(s.groundAt(p[0], p[1])).toBeCloseTo(p[2], 3);
		}
		// No contour crosses the level pad
		expect(s.contours.some((c) => c.a[0] > -14 && c.a[0] < 14 && c.a[1] > -19 && c.a[1] < 19)).toBe(false);
	});

	it('runs its edge around the board on the surface', () => {
		expect(s.edge[0]).toEqual([-100, -100, expect.closeTo(-10)]);
		expect(s.edge).toHaveLength(4 * 400);
		expect(s.minY).toBeCloseTo(-10);
	});
});

describe('drape', () => {
	const m = terrainModel(slope, 100)!;
	const s = gradedSurface(m, [[rect(-15, -20, 30, 40)]]);

	it('lays a flat shape on the surface, keeping its area', () => {
		const tris: [Pt, Pt, Pt][] = [[[20, 0], [60, 0], [60, 30]], [[20, 0], [60, 30], [20, 30]]];
		const pieces = drapeTriangles(s, tris);
		expect(pieces.reduce((a, p) => a + area(p.map((q) => [q[0], q[1]] as Pt)), 0)).toBeCloseTo(1200, 3);
		for (const p of pieces) for (const q of p) expect(q[2]).toBeCloseTo(s.groundAt(q[0], q[1]), 3);
	});

	it('lays a line on the surface, across the pad', () => {
		const segs = drapeLine(s, [[0, -40], [0, 40]]);
		expect(segs.reduce((a, g) => a + Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), 0)).toBeCloseTo(80, 3);
		for (const g of segs) for (const q of [g.a, g.b]) expect(q[2]).toBeCloseTo(s.groundAt(q[0], q[1]), 3);
	});
});

describe('on real ground', async () => {
	const { default: fixture } = await import('../server/fixtures/usgs-3dep.json');
	const { parseGeoTiff } = await import('../server/tiff');
	const { terrainFromRaster } = await import('../server/elevation');
	const bytes = Uint8Array.from(atob(fixture.tiffBase64), (c) => c.charCodeAt(0));
	const terrain = terrainFromRaster(parseGeoTiff(bytes.buffer), fixture.origin, 150)!;

	it('builds the surface quickly', () => {
		const t = performance.now();
		const m = terrainModel(terrain, 150)!;
		const s = gradedSurface(m, [[rect(-12, -10, 24, 14)], [rect(-8, 8, 12, 8)], [rect(40, -20, 15, 12)]]);
		expect(performance.now() - t).toBeLessThan(300);
		expect(s.positions.length).toBeGreaterThan(0);
	});

	it('builds an 800 m board in time', () => {
		const n = 161, heights: number[] = [];
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(Math.round((118 + 12 * Math.sin(i / 20) + 10 * Math.cos(j / 25)) * 10) / 10);
		const t = performance.now();
		const m = terrainModel({ spacing: 5, heights }, 400)!;
		gradedSurface(m, [[rect(-12, -10, 24, 14)], [rect(-8, 8, 12, 8)], [rect(40, -20, 15, 12)]]);
		expect(performance.now() - t).toBeLessThan(300);
	});
});
