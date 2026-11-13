import { describe, it, expect } from 'vitest';
import { buildingFooting, contourInterval, drapeLine, drapeTriangles, footingOf, terrainModel, terrainSurface, type TerrainSurface } from './terrain';
import { cameraFloor, CAMERA_CLEARANCE } from './view';
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
function meshTriangles(s: TerrainSurface): P3[][] {
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

	it('foots a building between the lowest and highest ground under it', () => {
		// 3 m to 33 m south: ground from 0.3 to 3.3
		expect(footingOf(m, rect(-10, 3, 20, 30))).toEqual({ base: expect.closeTo(0.3), floor: expect.closeTo(3.3) });
		const bowl = terrainModel(grid(100, 5, (x, y) => (Math.abs(x) < 6 && Math.abs(y) < 6 ? 95 : 105 + y / 50)), 100)!;
		expect(footingOf(bowl, rect(-30, -30, 60, 60)).base).toBeCloseTo(bowl.heightAt(0, 0));
	});

	it('gives a building of several pieces one floor and one plinth', () => {
		// Like St. Timothy's: 4 m of fall across the church and its wing
		expect(buildingFooting(m, [rect(-15, -20, 30, 20), rect(-5, 0, 10, 20)])).toEqual({ base: expect.closeTo(-2), floor: expect.closeTo(2) });
	});
});

describe('terrainSurface', () => {
	const m = terrainModel(slope, 100)!;
	const s = terrainSurface(m);

	it('keeps the orbit camera above it, out to past the board', () => {
		expect(cameraFloor(s, 0, 50)).toBeCloseTo(5 + CAMERA_CLEARANCE, 5);
		expect(cameraFloor(s, 0, 400)).toBeCloseTo(10 + CAMERA_CLEARANCE, 5); // the board's south edge
	});

	it('is the natural ground, meeting buildings flush', () => {
		for (const [x, y] of [[0, 0], [12.5, -31], [-99, 99]] as Pt[]) expect(s.groundAt(x, y)).toBeCloseTo(m.heightAt(x, y), 5);
	});

	it('covers the board exactly with the grid triangles, facing up', () => {
		const tris = meshTriangles(s);
		expect(tris).toHaveLength(40 * 40 * 2);
		const total = tris.reduce((a, t) => a + area(t.map((p) => [p[0], p[1]] as Pt)), 0);
		expect(total).toBeCloseTo(200 * 200, 3);
		for (const [a, b, c] of tris) {
			const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
			expect(cross).toBeLessThanOrEqual(0); // clockwise in site coordinates: up in the scene
		}
		for (let i = 1; i < s.normals.length; i += 3) expect(s.normals[i]).toBeGreaterThan(0);
	});

	it('etches the natural contours on it', () => {
		for (const c of s.contours) for (const p of [c.a, c.b]) expect(s.groundAt(p[0], p[1])).toBeCloseTo(p[2], 3);
	});

	it('runs its edge around the board on the surface', () => {
		expect(s.edge[0]).toEqual([-100, -100, expect.closeTo(-10)]);
		expect(s.edge).toHaveLength(4 * 40);
		expect(s.minY).toBeCloseTo(-10);
	});
});

describe('drape', () => {
	const m = terrainModel(slope, 100)!;
	const s = terrainSurface(m);

	it('lays a flat shape on the surface, keeping its area', () => {
		const tris: [Pt, Pt, Pt][] = [[[20, 0], [60, 0], [60, 30]], [[20, 0], [60, 30], [20, 30]]];
		const pieces = drapeTriangles(s, tris);
		expect(pieces.reduce((a, p) => a + area(p.map((q) => [q[0], q[1]] as Pt)), 0)).toBeCloseTo(1200, 3);
		for (const p of pieces) for (const q of p) expect(q[2]).toBeCloseTo(s.groundAt(q[0], q[1]), 3);
	});

	it('lays a line on the surface', () => {
		const segs = drapeLine(s, [[0, -40], [0, 40]]);
		expect(segs.reduce((a, g) => a + Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), 0)).toBeCloseTo(80, 3);
		for (const g of segs) for (const q of [g.a, g.b]) expect(q[2]).toBeCloseTo(s.groundAt(q[0], q[1]), 3);
	});
});

describe('on real ground', async () => {
	// The Terrain Tiles fixture, resampled as the server does: about 19 m of relief on a 300 m board
	const { default: fixture } = await import('../server/fixtures/terrarium.json');
	const { decodeTile, terrainFromTiles } = await import('../server/elevation');
	const tiles = new Map<string, Float32Array>();
	for (const t of fixture.tiles) tiles.set(`${t.x},${t.y}`, await decodeTile(Uint8Array.from(atob(t.pngBase64), (c) => c.charCodeAt(0)).buffer));
	const terrain = terrainFromTiles(tiles, fixture.origin, 150)!;

	it('builds the surface quickly', () => {
		const t = performance.now();
		const m = terrainModel(terrain, 150)!;
		const s = terrainSurface(m);
		expect(performance.now() - t).toBeLessThan(300);
		expect(s.positions.length).toBeGreaterThan(0);
	});

	it('builds an 800 m board in time', () => {
		const n = 161, heights: number[] = [];
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(Math.round((118 + 12 * Math.sin(i / 20) + 10 * Math.cos(j / 25)) * 10) / 10);
		const t = performance.now();
		const m = terrainModel({ spacing: 5, heights }, 400)!;
		terrainSurface(m);
		expect(performance.now() - t).toBeLessThan(300);
	});
});
