import { describe, it, expect } from 'vitest';
import {
	boardHalfFor,
	buildingsInParcel,
	clipLineToBoard,
	contextHeight,
	fitFootprint,
	minAreaRect,
	openRing,
	pointInPolygon,
	polygonCentroid,
	storiesFromTags,
	suggestSiteType,
	toLatLng,
	toLocal,
} from './geo';
import { partFootprint, polygonArea } from './metrics';
import { getPartCorners } from './snap';
import type { Part } from './types';

type Pt = [number, number];

const LEHIGH = { lat: 40.6071, lng: -75.3792 };

function rotate(points: Pt[], deg: number, [cx, cy]: Pt = [0, 0]): Pt[] {
	const r = (deg * Math.PI) / 180;
	return points.map(([x, y]) => [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
}

// The part's outline in site coordinates, using the same convention as rendering and snapping
function outline(part: Pick<Part, 'shape' | 'x' | 'y' | 'w' | 'd' | 'rotation' | 'points'>): Pt[] {
	if (part.shape !== 'poly') return getPartCorners(part as Part);
	const local = part.points!.map(([u, v]): Pt => [u * part.w, v * part.d]);
	return rotate(local, part.rotation, [part.x, part.y]);
}

describe('toLocal / toLatLng', () => {
	it('puts the origin at 0,0', () => {
		expect(toLocal(LEHIGH.lat, LEHIGH.lng, LEHIGH)).toEqual([0, 0]);
	});

	it('east is +x and north is -y', () => {
		const [x] = toLocal(LEHIGH.lat, LEHIGH.lng + 0.001, LEHIGH);
		const [, y] = toLocal(LEHIGH.lat + 0.001, LEHIGH.lng, LEHIGH);
		expect(x).toBeGreaterThan(0);
		expect(y).toBeLessThan(0);
	});

	it('matches the WGS84 ellipsoid to within 1 cm per 100 m', () => {
		// Exact ellipsoid values at 40.6071° N: 0.001° latitude = 111.046 m, 0.001° longitude = 84.633 m
		const [, y] = toLocal(LEHIGH.lat + 0.001, LEHIGH.lng, LEHIGH);
		const [x] = toLocal(LEHIGH.lat, LEHIGH.lng + 0.001, LEHIGH);
		expect(Math.abs(-y - 111.046)).toBeLessThan(0.011);
		expect(Math.abs(x - 84.633)).toBeLessThan(0.009);
	});

	it('round trips', () => {
		const ll = toLatLng(123.4, -56.7, LEHIGH);
		const [x, y] = toLocal(ll.lat, ll.lng, LEHIGH);
		expect(x).toBeCloseTo(123.4, 6);
		expect(y).toBeCloseTo(-56.7, 6);
	});
});

describe('polygon helpers', () => {
	const square: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

	it('drops a repeated closing vertex', () => {
		expect(openRing([...square, [0, 0]])).toEqual(square);
		expect(openRing(square)).toEqual(square);
	});

	it('finds centroids', () => {
		expect(polygonCentroid(square)).toEqual([5, 5]);
		const l: Pt[] = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
		const [cx, cy] = polygonCentroid(l);
		expect(cx).toBeCloseTo(8.333, 2);
		expect(cy).toBeCloseTo(8.333, 2);
	});

	it('tests points in polygons', () => {
		expect(pointInPolygon([5, 5], square)).toBe(true);
		expect(pointInPolygon([15, 5], square)).toBe(false);
	});
});

describe('minAreaRect', () => {
	it('recovers a rotated rectangle', () => {
		const rect = rotate([[-15, -5], [15, -5], [15, 5], [-15, 5]], 30, [40, -20]);
		const r = minAreaRect(rect);
		expect(r.w).toBeCloseTo(30, 6);
		expect(r.d).toBeCloseTo(10, 6);
		expect(r.rotation).toBeCloseTo(30, 6);
		expect(r.x).toBeCloseTo(40, 6);
		expect(r.y).toBeCloseTo(-20, 6);
	});

	it('keeps w as the longer side and rotation in 0..180', () => {
		const tall = rotate([[-3, -12], [3, -12], [3, 12], [-3, 12]], 200);
		const r = minAreaRect(tall);
		expect(r.w).toBeCloseTo(24, 6);
		expect(r.d).toBeCloseTo(6, 6);
		expect(r.rotation).toBeGreaterThanOrEqual(0);
		expect(r.rotation).toBeLessThan(180);
	});
});

describe('fitFootprint', () => {
	it('models a near-rectangle as a rect part', () => {
		const rect = rotate([[-15, -5], [15, -5], [15, 5], [-15, 5]], 12, [5, 5]);
		const part = fitFootprint([...rect, rect[0]]);
		expect(part.shape).toBe('rect');
		expect(part.points).toBeUndefined();
		expect(part.w).toBeCloseTo(30, 1);
		expect(part.rotation).toBeCloseTo(12, 1);
	});

	it('models an L-shaped church as a poly part with the same outline and area', () => {
		// Nave 30×12 with a 10×10 transept wing, turned 25°
		const l: Pt[] = rotate([[0, 0], [30, 0], [30, 12], [20, 12], [20, 22], [10, 22], [10, 12], [0, 12]], 25, [100, 50]);
		const part = fitFootprint(l);
		expect(part.shape).toBe('poly');
		expect(part.points).toHaveLength(8);
		for (const [u, v] of part.points!) {
			expect(Math.abs(u)).toBeLessThanOrEqual(0.5001);
			expect(Math.abs(v)).toBeLessThanOrEqual(0.5001);
		}
		expect(partFootprint({ id: 'p', ...part } as Part)).toBeCloseTo(polygonArea(l), 0);
		// Every original corner is reproduced to within 2 cm
		const rebuilt = outline(part);
		for (const p of l) {
			expect(Math.min(...rebuilt.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))).toBeLessThan(0.02);
		}
	});
});

describe('storiesFromTags', () => {
	it('uses building:levels', () => {
		expect(storiesFromTags({ building: 'yes', 'building:levels': '3' })).toEqual({ stories: 3, floorHeight: 3.5, source: 'data' });
	});

	it('derives floor height from height and levels', () => {
		expect(storiesFromTags({ building: 'school', 'building:levels': '2', height: '9 m' })).toEqual({ stories: 2, floorHeight: 4.5, source: 'data' });
	});

	it('turns a bare height into stories', () => {
		expect(storiesFromTags({ building: 'apartments', height: '14' })).toEqual({ stories: 4, floorHeight: 3.5, source: 'data' });
	});

	it('models a church as one tall nave story', () => {
		expect(storiesFromTags({ building: 'church' })).toEqual({ stories: 1, floorHeight: 9, source: 'default' });
		expect(storiesFromTags({ amenity: 'place_of_worship', building: 'yes', height: '13' })).toEqual({ stories: 1, floorHeight: 13, source: 'data' });
	});

	it('defaults untagged buildings to one story, marked as a default', () => {
		expect(storiesFromTags({ building: 'yes' })).toEqual({ stories: 1, floorHeight: 3.5, source: 'default' });
	});

	it('converts feet and ignores junk', () => {
		expect(storiesFromTags({ building: 'yes', height: "35'" }).stories).toBe(3);
		expect(storiesFromTags({ building: 'yes', height: 'tall', 'building:levels': 'two' }).source).toBe('default');
	});
});

describe('contextHeight', () => {
	it('prefers tags, then defaults by type', () => {
		expect(contextHeight({ building: 'yes', height: '20' })).toBe(20);
		expect(contextHeight({ building: 'yes', 'building:levels': '2' })).toBeCloseTo(6.4);
		expect(contextHeight({ building: 'house' })).toBe(7);
		expect(contextHeight({ building: 'garage' })).toBe(3);
		expect(contextHeight({ building: 'yes' })).toBe(8);
	});
});

describe('suggestSiteType', () => {
	const block = (x: number, y: number, size: number) => ({
		polygon: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]] as Pt[],
	});

	it('reads coverage of the surrounding circle', () => {
		// Circle of radius 150 m is ~70,700 m²
		expect(suggestSiteType([])).toBe('rural');
		expect(suggestSiteType([block(0, 0, 90)])).toBe('suburban'); // 8,100 m² ≈ 11%
		expect(suggestSiteType([block(-100, -100, 100), block(0, 0, 100)])).toBe('urban'); // ≈ 28%
	});

	it('ignores buildings outside the radius', () => {
		expect(suggestSiteType([block(400, 400, 150)])).toBe('rural');
	});
});

describe('buildingsInParcel', () => {
	it('keeps buildings whose centroid is on the parcel', () => {
		const parcel: Pt[] = [[0, 0], [50, 0], [50, 50], [0, 50]];
		const inside = { id: 'a', polygon: [[10, 10], [20, 10], [20, 20], [10, 20]] as Pt[] };
		const straddling = { id: 'b', polygon: [[45, 10], [70, 10], [70, 20], [45, 20]] as Pt[] };
		expect(buildingsInParcel([inside, straddling], parcel).map((b) => b.id)).toEqual(['a']);
	});
});

describe('clipLineToBoard', () => {
	it('keeps lines inside the board', () => {
		expect(clipLineToBoard([[0, 0], [10, 10]], 50)).toEqual([[[0, 0], [10, 10]]]);
	});

	it('trims lines at the edge', () => {
		expect(clipLineToBoard([[-100, 0], [100, 0]], 50)).toEqual([[[-50, 0], [50, 0]]]);
	});

	it('splits a line that leaves and comes back', () => {
		const out = clipLineToBoard([[0, 0], [100, 0], [100, 20], [0, 20]], 50);
		expect(out).toEqual([[[0, 0], [50, 0]], [[50, 20], [0, 20]]]);
	});

	it('drops lines entirely off the board', () => {
		expect(clipLineToBoard([[60, 60], [80, 90]], 50)).toEqual([]);
	});
});

describe('boardHalfFor', () => {
	const square = (h: number): [number, number][] => [[-h, -h], [h, -h], [h, h], [-h, h]];

	it('keeps the board when the parcel has room', () => {
		expect(boardHalfFor(square(60), 150)).toBeNull();
		expect(boardHalfFor(square(120), 150)).toBeNull(); // exactly at the 30 m margin
	});

	it('grows the board around a parcel near the edge, rounded to 10 m', () => {
		expect(boardHalfFor(square(125), 150)).toBe(190); // 125 + 60 margin
		expect(boardHalfFor([[0, 0], [10, 0], [10, -210]], 150)).toBe(270);
	});

	it('stops at the largest board', () => {
		expect(boardHalfFor(square(900), 150)).toBe(400);
		expect(boardHalfFor(square(900), 400)).toBeNull();
	});
});
