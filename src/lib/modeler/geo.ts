// Geometry for address mode: projection between lat/lng and local site meters, fitting
// real building footprints to parts, and reading heights from OpenStreetMap tags.
// Site coordinates: x is east, y is south (north is up in plan view, which is -y).

import polygonClipping from 'polygon-clipping';
import { polygonArea } from './metrics';
import { getPartCorners } from './snap';
import type { Part, Site } from './types';

export interface LatLng {
	lat: number;
	lng: number;
}

type Pt = [number, number];

// Meters per degree at a latitude (series expansion; accurate to centimeters at site scale,
// unlike a spherical earth, which is off by ~0.25% here)
function metersPerDegree(lat: number): { lat: number; lng: number } {
	const φ = (lat * Math.PI) / 180;
	return {
		lat: 111132.92 - 559.82 * Math.cos(2 * φ) + 1.175 * Math.cos(4 * φ),
		lng: 111412.84 * Math.cos(φ) - 93.5 * Math.cos(3 * φ),
	};
}

export function toLocal(lat: number, lng: number, origin: LatLng): Pt {
	const m = metersPerDegree(origin.lat);
	return [(lng - origin.lng) * m.lng, (origin.lat - lat) * m.lat];
}

export function toLatLng(x: number, y: number, origin: LatLng): LatLng {
	const m = metersPerDegree(origin.lat);
	return { lat: origin.lat - y / m.lat, lng: origin.lng + x / m.lng };
}

// Address mode shows context on a square board centered on the origin. Sizes are half the
// board's width: 150 m by default, grown to fit a large parcel, up to 400 m (an 800 m board).
export const CONTEXT_HALF_SIZE = 150;
export const MAX_BOARD_HALF = 400;
export const GROUND_HALF = 200; // grid mode: the 400 m ground plane
const BOARD_EDGE_MARGIN = 30; // a parcel closer than this to the edge grows the board
const BOARD_GROW_MARGIN = 60; // neighborhood kept around a parcel on a grown board

// The board size a parcel needs, or null if the current board already has room around it.
export function boardHalfFor(parcel: Pt[], current: number): number | null {
	const extent = Math.max(...parcel.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
	if (extent <= current - BOARD_EDGE_MARGIN || current >= MAX_BOARD_HALF) return null;
	return Math.min(MAX_BOARD_HALF, Math.ceil((extent + BOARD_GROW_MARGIN) / 10) * 10);
}

// ── Polygons ────────────────────────────────────────────────────────────────

// Drops a repeated closing vertex (GeoJSON and OSM rings repeat the first point).
export function openRing(ring: Pt[]): Pt[] {
	const [a, b] = [ring[0], ring[ring.length - 1]];
	return ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}

export function polygonCentroid(polygon: Pt[]): Pt {
	let a = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < polygon.length; i++) {
		const [x1, y1] = polygon[i];
		const [x2, y2] = polygon[(i + 1) % polygon.length];
		const cross = x1 * y2 - x2 * y1;
		a += cross;
		cx += (x1 + x2) * cross;
		cy += (y1 + y2) * cross;
	}
	if (Math.abs(a) < 1e-9) {
		// Degenerate: average the vertices
		const n = polygon.length;
		return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
	}
	return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon([x, y]: Pt, polygon: Pt[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

// Andrew's monotone chain
function convexHull(points: Pt[]): Pt[] {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (pts.length < 3) return pts;
	const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: Pt[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: Pt[] = [];
	for (const p of [...pts].reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

interface OrientedRect {
	x: number;
	y: number;
	w: number; // along the rotated x axis; always the longer side
	d: number;
	rotation: number; // degrees, same convention as Part.rotation
}

// Smallest-area rectangle around the polygon. One side of it always lies along a hull edge,
// so trying each edge's angle is enough (rotating calipers).
export function minAreaRect(polygon: Pt[]): OrientedRect {
	const hull = convexHull(polygon);
	let best: (OrientedRect & { area: number }) | null = null;
	for (let i = 0; i < hull.length; i++) {
		const [x1, y1] = hull[i];
		const [x2, y2] = hull[(i + 1) % hull.length];
		const θ = Math.atan2(y2 - y1, x2 - x1);
		const c = Math.cos(θ);
		const s = Math.sin(θ);
		// Project onto the edge's frame: local = R(-θ) · world
		let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
		for (const [x, y] of hull) {
			const u = x * c + y * s;
			const v = -x * s + y * c;
			minU = Math.min(minU, u); maxU = Math.max(maxU, u);
			minV = Math.min(minV, v); maxV = Math.max(maxV, v);
		}
		const area = (maxU - minU) * (maxV - minV);
		if (!best || area < best.area - 1e-9) {
			const cu = (minU + maxU) / 2;
			const cv = (minV + maxV) / 2;
			best = {
				area,
				x: cu * c - cv * s,
				y: cu * s + cv * c,
				w: maxU - minU,
				d: maxV - minV,
				rotation: (θ * 180) / Math.PI,
			};
		}
	}
	if (!best) return { x: 0, y: 0, w: 0, d: 0, rotation: 0 };
	let { x, y, w, d, rotation } = best;
	if (d > w) {
		[w, d] = [d, w];
		rotation += 90;
	}
	rotation = ((rotation % 180) + 180) % 180; // a rectangle looks the same turned 180°
	return { x, y, w, d, rotation };
}

// How much of its oriented rectangle a footprint must fill to be modeled as a plain rectangle.
const RECT_FILL = 0.95;

export type FittedPart = Pick<Part, 'shape' | 'x' | 'y' | 'w' | 'd' | 'rotation' | 'points'>;

// Turns a real footprint (local meters) into part geometry. Near-rectangles become `rect`
// parts, which keep every editing tool including gable roofs; other outlines become `poly`
// parts whose points are normalized to the w×d box, so resize and rotate still work.
export function fitFootprint(polygon: Pt[]): FittedPart {
	const ring = openRing(polygon);
	const r = minAreaRect(ring);
	const round = (n: number, step = 0.01) => Math.round(n / step) * step;
	const base = { x: round(r.x), y: round(r.y), w: round(r.w), d: round(r.d), rotation: round(r.rotation, 0.1) };
	if (r.w === 0 || r.d === 0 || polygonArea(ring) / (r.w * r.d) >= RECT_FILL) {
		return { shape: 'rect', ...base };
	}
	const θ = (r.rotation * Math.PI) / 180;
	const c = Math.cos(θ);
	const s = Math.sin(θ);
	const points = ring.map(([x, y]): Pt => {
		const dx = x - r.x;
		const dy = y - r.y;
		return [round((dx * c + dy * s) / r.w, 0.0001), round((-dx * s + dy * c) / r.d, 0.0001)];
	});
	return { shape: 'poly', ...base, points };
}

// ── Heights from OpenStreetMap tags ─────────────────────────────────────────

export type Tags = Record<string, string | undefined>;

const WORSHIP_BUILDINGS = ['church', 'chapel', 'cathedral', 'mosque', 'synagogue', 'temple', 'religious'];

export function isWorship(tags: Tags): boolean {
	return WORSHIP_BUILDINGS.includes(tags.building ?? '') || tags.amenity === 'place_of_worship';
}

// "12", "12 m", "12.5m" -> 12.5. Feet ("40'") are converted. Anything else is ignored.
function parseMeters(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const feet = value.match(/^\s*([\d.]+)\s*(ft|')\s*$/);
	if (feet) return Number(feet[1]) * 0.3048;
	const m = value.match(/^\s*([\d.]+)\s*(m)?\s*$/);
	const n = m ? Number(m[1]) : NaN;
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseLevels(value: string | undefined): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) && n >= 1 ? Math.round(n) : undefined;
}

export interface StructureHeight {
	stories: number;
	floorHeight: number;
	source: 'data' | 'default';
}

const FLOOR = 3.5;
const NAVE = 9; // PLAN.md: nave default

// Stories and floor height for a building on the parcel. Worship buildings without levels
// are modeled as one tall story (a nave) rather than several short ones.
export function storiesFromTags(tags: Tags): StructureHeight {
	const worship = isWorship(tags);
	const levels = parseLevels(tags['building:levels']);
	const height = parseMeters(tags.height);
	const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
	if (levels) {
		const floorHeight = height ? clamp(height / levels, 2.5, 15) : worship && levels === 1 ? NAVE : FLOOR;
		return { stories: levels, floorHeight: Math.round(floorHeight * 10) / 10, source: 'data' };
	}
	if (height) {
		if (worship) return { stories: 1, floorHeight: Math.round(clamp(height, 4, 20) * 10) / 10, source: 'data' };
		return { stories: Math.max(1, Math.round(height / FLOOR)), floorHeight: FLOOR, source: 'data' };
	}
	return { stories: 1, floorHeight: worship ? NAVE : FLOOR, source: 'default' };
}

const SMALL_BUILDINGS = ['garage', 'garages', 'shed', 'carport', 'hut'];
const HOUSES = ['house', 'residential', 'detached', 'semidetached_house', 'terrace', 'bungalow'];

// Height of a neighboring foam block. Only needs to look right, so defaults are by type.
export function contextHeight(tags: Tags): number {
	const height = parseMeters(tags.height);
	if (height) return height;
	const levels = parseLevels(tags['building:levels']);
	if (levels) return levels * 3.2;
	const kind = tags.building ?? '';
	if (SMALL_BUILDINGS.includes(kind)) return 3;
	if (HOUSES.includes(kind)) return 7;
	if (isWorship(tags)) return 12;
	return 8;
}

// ── Site-level helpers ──────────────────────────────────────────────────────

// Coverage thresholds are placeholders for the team to tune (PLAN.md: design decisions stay with the team).
const URBAN_COVERAGE = 0.25;
const SUBURBAN_COVERAGE = 0.08;

// Suggests urban, suburban or rural from how much of the surrounding circle is built on.
export function suggestSiteType(buildings: { polygon: Pt[] }[], radius = 150): NonNullable<Site['siteType']> {
	let built = 0;
	for (const b of buildings) {
		const [cx, cy] = polygonCentroid(b.polygon);
		if (Math.hypot(cx, cy) <= radius) built += polygonArea(b.polygon);
	}
	const coverage = built / (Math.PI * radius * radius);
	return coverage > URBAN_COVERAGE ? 'urban' : coverage > SUBURBAN_COVERAGE ? 'suburban' : 'rural';
}

// Clips a polyline to the square board (|x|, |y| <= half), splitting it where it leaves and
// re-enters. Liang-Barsky per segment.
export function clipLineToBoard(line: Pt[], half: number): Pt[][] {
	const out: Pt[][] = [];
	let current: Pt[] = [];
	const flush = () => {
		if (current.length >= 2) out.push(current);
		current = [];
	};
	for (let i = 0; i < line.length - 1; i++) {
		const [x0, y0] = line[i];
		const [x1, y1] = line[i + 1];
		const dx = x1 - x0;
		const dy = y1 - y0;
		let t0 = 0;
		let t1 = 1;
		let visible = true;
		for (const [p, q] of [[-dx, x0 + half], [dx, half - x0], [-dy, y0 + half], [dy, half - y0]] as const) {
			if (p === 0) {
				if (q < 0) visible = false;
			} else {
				const t = q / p;
				if (p < 0) t0 = Math.max(t0, t);
				else t1 = Math.min(t1, t);
			}
		}
		if (!visible || t0 > t1) {
			flush();
			continue;
		}
		const a: Pt = [x0 + t0 * dx, y0 + t0 * dy];
		const b: Pt = [x0 + t1 * dx, y0 + t1 * dy];
		const last = current[current.length - 1];
		if (!last || last[0] !== a[0] || last[1] !== a[1]) {
			flush();
			current.push(a);
		}
		current.push(b);
		if (t1 < 1) flush(); // left the board
	}
	flush();
	return out;
}

// Buildings whose centroid falls inside the parcel.
export function buildingsInParcel<B extends { polygon: Pt[] }>(buildings: B[], parcel: Pt[]): B[] {
	return buildings.filter((b) => pointInPolygon(polygonCentroid(b.polygon), parcel));
}

// Joins neighboring parcels into one outline, or null if they don't form a single piece
// (lots that don't touch). County parcels share edges exactly, so no tolerance is needed.
export function mergeParcels(parcels: Pt[][]): Pt[] | null {
	if (parcels.length === 0) return null;
	if (parcels.length === 1) return parcels[0];
	const [first, ...rest] = parcels.map((p) => [[...p, p[0]]] as polygonClipping.Polygon);
	const merged = polygonClipping.union(first, ...rest);
	if (merged.length !== 1) return null;
	return openRing(merged[0][0] as Pt[]); // outer ring; an enclosed hole would be a lot left out
}

// ── Cutting parts ───────────────────────────────────────────────────────────

const CIRCLE_SEGMENTS = 32;
const MIN_PIECE_AREA = 1; // m²; slivers from a cut along an edge are dropped

// A part's outline in site coordinates, for any shape.
export function partOutline(part: Part): Pt[] {
	if (part.shape === 'rect' || part.shape === 'square') return getPartCorners(part);
	let local: Pt[];
	if (part.shape === 'tri') {
		local = [[-part.w / 2, part.d / 2], [part.w / 2, part.d / 2], [0, -part.d / 2]];
	} else if (part.shape === 'circle') {
		local = Array.from({ length: CIRCLE_SEGMENTS }, (_, i): Pt => {
			const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
			return [(Math.cos(a) * part.w) / 2, (Math.sin(a) * part.d) / 2];
		});
	} else {
		local = (part.points ?? []).map(([u, v]): Pt => [u * part.w, v * part.d]);
	}
	const θ = (part.rotation * Math.PI) / 180;
	const c = Math.cos(θ);
	const s = Math.sin(θ);
	return local.map(([x, y]): Pt => [part.x + x * c - y * s, part.y + x * s + y * c]);
}

// Cuts a polygon along the infinite line through a and b. Each side may hold several pieces
// (a line through both arms of an L makes three). Empty if the line misses.
export function splitPolygon(polygon: Pt[], a: Pt, b: Pt): Pt[][] {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len = Math.hypot(dx, dy);
	if (len === 0) return [];
	// Half-planes as huge quads on either side of the line
	const far = 1e5;
	const [ux, uy] = [dx / len, dy / len];
	const [nx, ny] = [-uy * far, ux * far];
	const p1: Pt = [a[0] - ux * far, a[1] - uy * far];
	const p2: Pt = [a[0] + ux * far, a[1] + uy * far];
	const side = (sign: number): polygonClipping.Polygon => [[
		p1, p2, [p2[0] + sign * nx, p2[1] + sign * ny], [p1[0] + sign * nx, p1[1] + sign * ny], p1,
	]];
	const subject: polygonClipping.Polygon = [[...polygon, polygon[0]]];
	const pieces = [1, -1].map((sign) =>
		polygonClipping
			.intersection(subject, side(sign))
			.map((p) => openRing(p[0] as Pt[]))
			.filter((ring) => polygonArea(ring) >= MIN_PIECE_AREA),
	);
	// A real cut leaves something on both sides
	return pieces[0].length && pieces[1].length ? [...pieces[0], ...pieces[1]] : [];
}

// A part cut into new part geometries, or null if the line doesn't cross it.
export function splitPart(part: Part, a: Pt, b: Pt): FittedPart[] | null {
	const pieces = splitPolygon(partOutline(part), a, b);
	return pieces.length ? pieces.map(fitFootprint) : null;
}

// Shortest distance between two polygons: 0 when they overlap or touch.
export function polygonDistance(a: Pt[], b: Pt[]): number {
	if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return 0;
	let best = Infinity;
	for (let i = 0; i < a.length; i++) {
		const a1 = a[i];
		const a2 = a[(i + 1) % a.length];
		for (let j = 0; j < b.length; j++) {
			const b1 = b[j];
			const b2 = b[(j + 1) % b.length];
			if (segmentsCross(a1, a2, b1, b2)) return 0; // e.g. two bars crossing in a plus
			best = Math.min(best, segmentPointDistance(a1, a2, b1), segmentPointDistance(b1, b2, a1));
		}
	}
	return best;
}

function segmentPointDistance([ax, ay]: Pt, [bx, by]: Pt, [px, py]: Pt): number {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
	const orient = (a: Pt, b: Pt, c: Pt) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
	return orient(p1, p2, q1) * orient(p1, p2, q2) < 0 && orient(q1, q2, p1) * orient(q1, q2, p2) < 0;
}
