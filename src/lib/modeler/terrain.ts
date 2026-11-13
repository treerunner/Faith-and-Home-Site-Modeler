import { pointInPolygon } from './geo';
import type { Terrain } from './types';

// Terrain as a stepped study model: stacked chipboard layers, one per contour interval. Pure,
// and derived from the stored heights on every render; nothing here is saved.
//
// The grid is split into triangles (each cell on its NW-SE diagonal). A triangle is a plane,
// so each contour crosses it as one straight segment and each layer covers a convex piece of it.

type Pt = [number, number];

const INTERVALS = [0.5, 1, 2, 5];
const MAX_LAYERS = 15;
const EPS = 1e-9;

// The finest interval that keeps the board to MAX_LAYERS, or null when it is about flat
export function contourInterval(heights: number[]): number | null {
	let min = Infinity, max = -Infinity;
	for (const h of heights) {
		if (h < min) min = h;
		if (h > max) max = h;
	}
	const relief = max - min;
	if (!(relief >= INTERVALS[0])) return null;
	return INTERVALS.find((i) => relief / i <= MAX_LAYERS) ?? INTERVALS[INTERVALS.length - 1];
}

// A piece of one layer's top, at height y
export interface Band { y: number; polygon: Pt[] }
// A contour: the edge of the layer whose top is at y, a wall from y - interval up to y
export interface Contour { y: number; a: Pt; b: Pt; index: boolean } // index: every fifth contour

export interface TerrainModel {
	interval: number;
	half: number;
	spacing: number; // between grid points
	minY: number; // the lowest layer top; the board's own surface
	maxY: number;
	heightAt(x: number, y: number): number; // meters above the zero level, unstepped
	stepAt(x: number, y: number): number; // the layer top under a point
	bands: Band[];
	contours: Contour[];
	edges: Contour[]; // the board's outer sides: walls where layers meet the edge
	bandsIn(minX: number, minY: number, maxX: number, maxY: number): Band[];
}

// A point carrying the terrain value in level units
type V = [number, number, number];

// Keeps the part of a convex polygon where value >= k (sign 1) or value <= k (sign -1)
function clipLevel(poly: V[], k: number, sign: 1 | -1): V[] {
	const out: V[] = [];
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i], q = poly[(i + 1) % poly.length];
		const dp = (p[2] - k) * sign, dq = (q[2] - k) * sign;
		if (dp >= 0) out.push(p);
		if ((dp >= 0) !== (dq >= 0)) {
			const t = dp / (dp - dq);
			out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), k]);
		}
	}
	return out;
}

function area(poly: Pt[]): number {
	let a = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
		a += x1 * y2 - x2 * y1;
	}
	return a / 2;
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

	// The layer under the origin sits at y = 0, so the site stays where plan view puts it
	const z0 = Math.floor(absoluteAt(0, 0) / interval + EPS) * interval;
	// In layers above the zero layer. Heights are rounded to 0.1 m and often fall exactly on a
	// level; the nudge keeps every grid point off the levels, so contours never pass through one.
	const level = (z: number) => (z - z0) / interval + 1e-6;
	const step = (u: number) => Math.floor(u);

	const bands: Band[] = [];
	const contours: Contour[] = [];
	const byCell: Band[][] = Array.from({ length: cells * cells }, () => []);
	const isIndex = (k: number) => Math.round((z0 + k * interval) / interval) % 5 === 0;
	let minK = Infinity, maxK = -Infinity;

	for (let i = 0; i < cells; i++) {
		for (let j = 0; j < cells; j++) {
			const x0 = -half + j * spacing, y0 = -half + i * spacing, x1 = x0 + spacing, y1 = y0 + spacing;
			const v00: V = [x0, y0, level(node(i, j))], v10: V = [x1, y0, level(node(i, j + 1))];
			const v01: V = [x0, y1, level(node(i + 1, j))], v11: V = [x1, y1, level(node(i + 1, j + 1))];
			for (const tri of [[v00, v10, v11], [v00, v11, v01]] as V[][]) {
				const us = tri.map((v) => v[2]);
				const lo = step(Math.min(...us)), hi = step(Math.max(...us));
				minK = Math.min(minK, lo);
				maxK = Math.max(maxK, hi);
				for (let k = lo; k <= hi; k++) {
					// This layer's top: the part of the triangle between level k and k + 1
					let poly = k > lo ? clipLevel(tri, k, 1) : tri;
					if (k < hi) poly = clipLevel(poly, k + 1, -1);
					const flat = poly.map(([x, y]) => [x, y] as Pt);
					if (flat.length >= 3 && Math.abs(area(flat)) > EPS) {
						const band = { y: k * interval, polygon: flat };
						bands.push(band);
						byCell[i * cells + j].push(band);
					}
					// Its edge, where the triangle crosses level k
					if (k > lo) {
						const cross: Pt[] = [];
						for (let e = 0; e < 3; e++) {
							const p = tri[e], q = tri[(e + 1) % 3];
							if ((p[2] - k) * (q[2] - k) < 0) {
								const t = (k - p[2]) / (q[2] - p[2]);
								cross.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
							}
						}
						if (cross.length >= 2) contours.push({ y: k * interval, a: cross[0], b: cross[1], index: isIndex(k) });
					}
				}
			}
		}
	}

	// The board's sides: along each outer edge, every layer above the lowest shows its side
	const edges: Contour[] = [];
	const boundary: [V, V][] = [];
	for (let t = 0; t < cells; t++) {
		const a = -half + t * spacing, b = a + spacing;
		boundary.push([[a, -half, level(node(0, t))], [b, -half, level(node(0, t + 1))]]);
		boundary.push([[a, half, level(node(cells, t))], [b, half, level(node(cells, t + 1))]]);
		boundary.push([[-half, a, level(node(t, 0))], [-half, b, level(node(t + 1, 0))]]);
		boundary.push([[half, a, level(node(t, cells))], [half, b, level(node(t + 1, cells))]]);
	}
	for (const [p, q] of boundary) {
		for (let k = minK + 1; k <= step(Math.max(p[2], q[2])); k++) {
			// The part of the edge at or above level k
			const t = Math.min(1, Math.max(0, (k - p[2]) / (q[2] - p[2] || EPS)));
			const at = (f: number): Pt => [p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])];
			const [a, b] = p[2] >= k && q[2] >= k ? [at(0), at(1)] : p[2] >= k ? [at(0), at(t)] : [at(t), at(1)];
			edges.push({ y: k * interval, a, b, index: false });
		}
	}

	return {
		interval,
		half,
		spacing,
		minY: minK * interval,
		maxY: maxK * interval,
		heightAt: (x, y) => absoluteAt(x, y) - z0,
		stepAt: (x, y) => step(level(absoluteAt(x, y))) * interval,
		bands,
		contours,
		edges,
		bandsIn(minX, minY, maxX, maxY) {
			const j0 = Math.floor(toGrid(minX)), j1 = Math.floor(toGrid(maxX));
			const i0 = Math.floor(toGrid(minY)), i1 = Math.floor(toGrid(maxY));
			const out: Band[] = [];
			for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(...byCell[i * cells + j]);
			return out;
		},
	};
}

// The lowest layer top under a footprint, so a building on a slope never floats: its corners,
// points along its edges, its center and the grid points inside it
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
	const g = model.spacing;
	for (let x = Math.ceil((minX + model.half) / g) * g - model.half; x <= maxX; x += g)
		for (let y = Math.ceil((minY + model.half) / g) * g - model.half; y <= maxY; y += g)
			if (pointInPolygon([x, y], footprint)) samples.push([x, y]);
	return Math.min(...samples.map(([x, y]) => model.stepAt(x, y)));
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

// Lays flat triangles (a road ribbon, a triangulated open space) onto the layer tops: each
// returned piece lies on one layer, at its height
export function drapeTriangles(model: TerrainModel, triangles: [Pt, Pt, Pt][]): Band[] {
	const out: Band[] = [];
	for (const tri of triangles) {
		const xs = tri.map((p) => p[0]), ys = tri.map((p) => p[1]);
		for (const band of model.bandsIn(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
			const piece = clipConvex(tri, band.polygon);
			if (piece.length >= 3 && Math.abs(area(piece)) > EPS) out.push({ y: band.y, polygon: piece });
		}
	}
	return out;
}

// Lays a polyline onto the layer tops: segments, each on one layer
export function drapeLine(model: TerrainModel, points: Pt[]): { y: number; a: Pt; b: Pt }[] {
	const out: { y: number; a: Pt; b: Pt }[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p = points[i], q = points[i + 1];
		for (const band of model.bandsIn(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]))) {
			// Parametric clip of p→q against the band's edges (Cyrus-Beck)
			const s = area(band.polygon) >= 0 ? 1 : -1;
			let t0 = 0, t1 = 1;
			const poly = band.polygon;
			for (let e = 0; e < poly.length && t0 <= t1; e++) {
				const [ax, ay] = poly[e], [bx, by] = poly[(e + 1) % poly.length];
				const side = (x: number, y: number) => s * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
				const dp = side(p[0], p[1]), dq = side(q[0], q[1]);
				if (dp < 0 && dq < 0) t0 = 2;
				else if (dp < 0) t0 = Math.max(t0, dp / (dp - dq));
				else if (dq < 0) t1 = Math.min(t1, dp / (dp - dq));
			}
			if (t1 - t0 > EPS) {
				const at = (t: number): Pt => [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
				out.push({ y: band.y, a: at(t0), b: at(t1) });
			}
		}
	}
	return out;
}
