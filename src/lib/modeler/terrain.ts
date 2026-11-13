import { pointInPolygon } from './geo';
import type { Terrain } from './types';

// Terrain as a milled site model: a smooth surface from the elevation grid, with contours
// etched on it and a level pad graded under each building. Pure, and derived from the stored
// heights on every render; nothing here is saved.
//
// The grid is split into triangles (each cell on its NW-SE diagonal), and the surface is flat
// within each one, so contours cross a triangle as one straight segment.

type Pt = [number, number];
type P3 = [number, number, number]; // site x, site y, height

const INTERVALS = [0.5, 1, 2, 5];
const MAX_CONTOURS = 15;
const EPS = 1e-9;
export const APRON = 3; // meters of bank between a pad and the natural slope
const PAD_CELL = 0.5; // mesh resolution near pads, so their edges and banks stay crisp

// The finest contour interval that keeps the board to MAX_CONTOURS lines, or null when it is
// about flat (and gets no terrain at all)
export function contourInterval(heights: number[]): number | null {
	let min = Infinity, max = -Infinity;
	for (const h of heights) {
		if (h < min) min = h;
		if (h > max) max = h;
	}
	const relief = max - min;
	if (!(relief >= INTERVALS[0])) return null;
	return INTERVALS.find((i) => relief / i <= MAX_CONTOURS) ?? INTERVALS[INTERVALS.length - 1];
}

export interface Contour { a: P3; b: P3; index: boolean } // index: every fifth contour

// Where a triangle crosses each contour level. Heights are relative to the origin's ground
// (`zero` m absolute); levels are absolute multiples of the interval. Points exactly on a level
// count as just above it, so a contour never passes through a vertex twice.
function contoursOf(tri: P3[], interval: number, zero: number, out: Contour[]) {
	const u = tri.map((p) => (p[2] + zero) / interval + 1e-6);
	const lo = Math.ceil(Math.min(...u)), hi = Math.floor(Math.max(...u));
	for (let k = lo; k <= hi; k++) {
		const cross: P3[] = [];
		for (let e = 0; e < 3; e++) {
			const f = (e + 1) % 3;
			if ((u[e] - k) * (u[f] - k) < 0) {
				const t = (k - u[e]) / (u[f] - u[e]);
				const p = tri[e], q = tri[f];
				cross.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), k * interval - zero]);
			}
		}
		if (cross.length === 2) out.push({ a: cross[0], b: cross[1], index: k % 5 === 0 });
	}
}

// ── Natural surface ──────────────────────────────────────────────────────────

export interface TerrainModel {
	interval: number; // between contours
	half: number;
	spacing: number; // between grid points
	zero: number; // absolute height of the ground at the origin, which sits at y = 0
	heightAt(x: number, y: number): number; // relative to the origin's ground
	contours: Contour[]; // of the natural ground, for plan view
}

// `half` is the board's half-width: the grid runs from -half to +half
export function terrainModel(terrain: Terrain, half: number): TerrainModel | null {
	const { spacing, heights } = terrain;
	const n = Math.round(Math.sqrt(heights.length));
	const interval = contourInterval(heights);
	if (!interval || n < 2) return null;

	const node = (i: number, j: number) => heights[i * n + j];
	const cells = n - 1;
	const toGrid = (v: number) => Math.min(cells - EPS, Math.max(0, (v + half) / spacing));
	function absoluteAt(x: number, y: number): number {
		const gx = toGrid(x), gy = toGrid(y);
		const j = Math.floor(gx), i = Math.floor(gy);
		const fx = gx - j, fy = gy - i;
		const z00 = node(i, j), z10 = node(i, j + 1), z01 = node(i + 1, j), z11 = node(i + 1, j + 1);
		return fx >= fy ? z00 + fx * (z10 - z00) + fy * (z11 - z10) : z00 + fy * (z01 - z00) + fx * (z11 - z01);
	}
	const zero = absoluteAt(0, 0);

	const contours: Contour[] = [];
	for (let i = 0; i < cells; i++) {
		for (let j = 0; j < cells; j++) {
			const x0 = -half + j * spacing, y0 = -half + i * spacing, x1 = x0 + spacing, y1 = y0 + spacing;
			const p00: P3 = [x0, y0, node(i, j) - zero], p10: P3 = [x1, y0, node(i, j + 1) - zero];
			const p01: P3 = [x0, y1, node(i + 1, j) - zero], p11: P3 = [x1, y1, node(i + 1, j + 1) - zero];
			contoursOf([p00, p10, p11], interval, zero, contours);
			contoursOf([p00, p11, p01], interval, zero, contours);
		}
	}

	return { interval, half, spacing, zero, heightAt: (x, y) => absoluteAt(x, y) - zero, contours };
}

// The lowest natural ground under a footprint, so a building never floats: its corners, points
// along its edges, its center and the grid points inside it
export function baseOf(model: TerrainModel, footprint: Pt[]): number {
	const samples: Pt[] = [];
	for (let i = 0; i < footprint.length; i++) {
		const [x1, y1] = footprint[i], [x2, y2] = footprint[(i + 1) % footprint.length];
		const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
		for (let s = 0; s < steps; s++) samples.push([x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps]);
	}
	const xs = footprint.map((p) => p[0]), ys = footprint.map((p) => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
	samples.push([(minX + maxX) / 2, (minY + maxY) / 2]);
	const g = model.spacing, h = model.half;
	for (let x = Math.ceil((minX + h) / g) * g - h; x <= maxX; x += g)
		for (let y = Math.ceil((minY + h) / g) * g - h; y <= maxY; y += g)
			if (pointInPolygon([x, y], footprint)) samples.push([x, y]);
	return Math.min(...samples.map(([x, y]) => model.heightAt(x, y)));
}

// ── Graded surface ───────────────────────────────────────────────────────────

export interface GradedSurface {
	positions: Float32Array; // triangles in scene coordinates (x, up, z = site y), facing up
	normals: Float32Array;
	bases: number[]; // per structure, the height its pad is graded to
	groundAt(x: number, y: number): number; // the drawn surface's height
	contours: Contour[]; // etched on the surface, bending around pads
	edge: P3[]; // the surface along the board's outer edge, clockwise, for its side
	minY: number;
	trianglesIn(minX: number, minY: number, maxX: number, maxY: number): P3[][];
}

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
	const dx = bx - ax, dy = by - ay;
	const len2 = dx * dx + dy * dy;
	const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Height of the plane through a triangle at a point
function planeAt(tri: P3[], x: number, y: number): number {
	const [a, b, c] = tri;
	const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
	if (Math.abs(det) < EPS) return a[2];
	const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
	const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
	return l1 * a[2] + l2 * b[2] + (1 - l1 - l2) * c[2];
}

function inTriangle(tri: P3[], x: number, y: number): boolean {
	const side = (p: P3, q: P3) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
	const d1 = side(tri[0], tri[1]), d2 = side(tri[1], tri[2]), d3 = side(tri[2], tri[0]);
	return !((d1 < -EPS || d2 < -EPS || d3 < -EPS) && (d1 > EPS || d2 > EPS || d3 > EPS));
}

// The ground with each structure on a level pad: `structures` lists each one's piece outlines.
// A pad sits at the lowest natural ground under its structure, so the building stands at full
// height and never floats; around it, a bank APRON m wide returns to the slope.
export function gradedSurface(model: TerrainModel, structures: Pt[][][]): GradedSurface {
	const { half, spacing, interval, zero } = model;
	const bases = structures.map((parts) => (parts.length ? Math.min(...parts.map((p) => baseOf(model, p))) : 0));
	const pads = structures.flatMap((parts, s) =>
		parts.map((outline) => {
			const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
			return {
				outline,
				base: bases[s],
				box: [Math.min(...xs) - APRON, Math.min(...ys) - APRON, Math.max(...xs) + APRON, Math.max(...ys) + APRON],
			};
		}),
	);

	// Inside a footprint: its pad. In the bank: from the pad back to the slope. The nearest
	// footprint wins where pads meet.
	function ground(x: number, y: number): number {
		let best = APRON, base = 0;
		for (const pad of pads) {
			const [x0, y0, x1, y1] = pad.box;
			if (x < x0 || x > x1 || y < y0 || y > y1) continue;
			let d = 0;
			if (!pointInPolygon([x, y], pad.outline)) {
				d = Infinity;
				for (let i = 0; i < pad.outline.length; i++) d = Math.min(d, distToSegment([x, y], pad.outline[i], pad.outline[(i + 1) % pad.outline.length]));
			}
			if (d < best || (d === 0 && best === 0 && pad.base < base)) {
				best = d;
				base = pad.base;
			}
		}
		const natural = model.heightAt(x, y);
		if (best >= APRON) return natural;
		const t = best / APRON;
		return base * (1 - t) + natural * t;
	}

	// Mesh: 5 m cells, subdivided where a pad or its bank reaches. Triangles are emitted cell by
	// cell, so each cell's triangles are one run, for lookups.
	const cells = Math.round((2 * half) / spacing);
	const tris: P3[][] = [];
	const cellStart = new Int32Array(cells * cells + 1);
	const touchesPad = (x0: number, y0: number, x1: number, y1: number) =>
		pads.some(({ box }) => x1 >= box[0] && x0 <= box[2] && y1 >= box[1] && y0 <= box[3]);
	for (let i = 0; i < cells; i++) {
		for (let j = 0; j < cells; j++) {
			cellStart[i * cells + j] = tris.length;
			const x0 = -half + j * spacing, y0 = -half + i * spacing;
			const k = touchesPad(x0, y0, x0 + spacing, y0 + spacing) ? Math.round(spacing / PAD_CELL) : 1;
			const step = spacing / k;
			const row: P3[][] = [];
			for (let a = 0; a <= k; a++) {
				row.push([]);
				for (let b = 0; b <= k; b++) {
					const x = x0 + b * step, y = y0 + a * step;
					row[a].push([x, y, ground(x, y)]);
				}
			}
			for (let a = 0; a < k; a++) {
				for (let b = 0; b < k; b++) {
					tris.push([row[a][b], row[a][b + 1], row[a + 1][b + 1]], [row[a][b], row[a + 1][b + 1], row[a + 1][b]]);
				}
			}
		}
	}
	cellStart[cells * cells] = tris.length;

	const cellOf = (v: number) => Math.min(cells - 1, Math.max(0, Math.floor((v + half) / spacing)));
	function trianglesIn(minX: number, minY: number, maxX: number, maxY: number): P3[][] {
		const out: P3[][] = [];
		for (let i = cellOf(minY); i <= cellOf(maxY); i++)
			for (let j = cellOf(minX); j <= cellOf(maxX); j++)
				for (let t = cellStart[i * cells + j]; t < cellStart[i * cells + j + 1]; t++) out.push(tris[t]);
		return out;
	}
	function groundAt(x: number, y: number): number {
		const c = Math.max(-half, Math.min(half, x)), d = Math.max(-half, Math.min(half, y));
		for (const tri of trianglesIn(c, d, c, d)) if (inTriangle(tri, c, d)) return planeAt(tri, c, d);
		return ground(c, d);
	}

	// Scene buffers. Site (x, y) is scene (x, z), and a triangle wound counterclockwise in site
	// coordinates faces down in the scene, so each is emitted the other way round. Normals come
	// from the ground's slope, so shading stays smooth across triangles.
	const positions = new Float32Array(tris.length * 9);
	const normals = new Float32Array(tris.length * 9);
	const normalCache = new Map<string, [number, number, number]>();
	function normalAt(x: number, y: number): [number, number, number] {
		const key = `${x.toFixed(3)},${y.toFixed(3)}`;
		let nrm = normalCache.get(key);
		if (!nrm) {
			const h = PAD_CELL / 2;
			const gx = (ground(x + h, y) - ground(x - h, y)) / (2 * h);
			const gy = (ground(x, y + h) - ground(x, y - h)) / (2 * h);
			const len = Math.hypot(gx, 1, gy);
			nrm = [-gx / len, 1 / len, -gy / len];
			normalCache.set(key, nrm);
		}
		return nrm;
	}
	let minY = Infinity;
	tris.forEach((tri, t) => {
		const [a, b, c] = tri;
		const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
		const order = ccw ? [a, c, b] : [a, b, c];
		order.forEach((p, v) => {
			const o = t * 9 + v * 3;
			positions[o] = p[0];
			positions[o + 1] = p[2];
			positions[o + 2] = p[1];
			const nrm = normalAt(p[0], p[1]);
			normals[o] = nrm[0];
			normals[o + 1] = nrm[1];
			normals[o + 2] = nrm[2];
			if (p[2] < minY) minY = p[2];
		});
	});

	const contours: Contour[] = [];
	for (const tri of tris) contoursOf(tri, interval, zero, contours);

	// The outer edge, at the mesh's finest spacing so the side meets the surface everywhere
	const edge: P3[] = [];
	const steps = Math.round((2 * half) / PAD_CELL);
	const along = (s: number) => -half + (2 * half * s) / steps;
	for (let s = 0; s < steps; s++) edge.push([along(s), -half, groundAt(along(s), -half)]);
	for (let s = 0; s < steps; s++) edge.push([half, along(s), groundAt(half, along(s))]);
	for (let s = steps; s > 0; s--) edge.push([along(s), half, groundAt(along(s), half)]);
	for (let s = steps; s > 0; s--) edge.push([-half, along(s), groundAt(-half, along(s))]);

	return { positions, normals, bases, groundAt, contours, edge, minY, trianglesIn };
}

// ── Draping ──────────────────────────────────────────────────────────────────

function area(poly: Pt[]): number {
	let a = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
		a += x1 * y2 - x2 * y1;
	}
	return a / 2;
}

// Clips a convex polygon to a convex clip polygon (Sutherland-Hodgman). Winding-independent.
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
	const s = area(clip) >= 0 ? 1 : -1;
	let out = subject;
	for (let i = 0; i < clip.length && out.length; i++) {
		const [ax, ay] = clip[i], [bx, by] = clip[(i + 1) % clip.length];
		const side = ([x, y]: Pt) => s * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
		const input = out;
		out = [];
		for (let k = 0; k < input.length; k++) {
			const p = input[k], q = input[(k + 1) % input.length];
			const dp = side(p), dq = side(q);
			if (dp >= 0) out.push(p);
			if ((dp >= 0) !== (dq >= 0)) {
				const t = dp / (dp - dq);
				out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
			}
		}
	}
	return out;
}

const flat = (tri: P3[]): Pt[] => tri.map((p) => [p[0], p[1]]);
const bbox = (pts: Pt[]) => {
	const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
};

// Lays flat triangles (a road ribbon, a triangulated open space) onto the surface: each piece
// lies within one surface triangle, its corners at the surface's height
export function drapeTriangles(surface: GradedSurface, triangles: [Pt, Pt, Pt][]): P3[][] {
	const out: P3[][] = [];
	for (const tri of triangles) {
		for (const cell of surface.trianglesIn(...bbox(tri))) {
			const piece = clipConvex(tri, flat(cell));
			if (piece.length >= 3 && Math.abs(area(piece)) > EPS) out.push(piece.map(([x, y]) => [x, y, planeAt(cell, x, y)]));
		}
	}
	return out;
}

// Lays a polyline onto the surface: segments, each within one surface triangle
export function drapeLine(surface: GradedSurface, points: Pt[]): { a: P3; b: P3 }[] {
	const out: { a: P3; b: P3 }[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p = points[i], q = points[i + 1];
		for (const cell of surface.trianglesIn(...bbox([p, q]))) {
			// Parametric clip of p→q against the triangle's edges (Cyrus-Beck)
			const poly = flat(cell);
			const s = area(poly) >= 0 ? 1 : -1;
			let t0 = 0, t1 = 1;
			for (let e = 0; e < 3 && t0 <= t1; e++) {
				const [ax, ay] = poly[e], [bx, by] = poly[(e + 1) % 3];
				const side = (x: number, y: number) => s * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
				const dp = side(p[0], p[1]), dq = side(q[0], q[1]);
				if (dp < 0 && dq < 0) t0 = 2;
				else if (dp < 0) t0 = Math.max(t0, dp / (dp - dq));
				else if (dq < 0) t1 = Math.min(t1, dp / (dp - dq));
			}
			if (t1 - t0 > EPS) {
				const at = (t: number): P3 => {
					const x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]);
					return [x, y, planeAt(cell, x, y)];
				};
				out.push({ a: at(t0), b: at(t1) });
			}
		}
	}
	return out;
}
