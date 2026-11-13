import { describe, it, expect } from 'vitest';
import { parseGeoTiff } from './tiff';
import { terrainFromRaster, terrainUrl, TERRAIN_SPACING } from './elevation';
import fixture from './fixtures/usgs-3dep.json';

// Captured live from USGS 3DEP exportImage for a 150 m board around the church fixture's origin
const { origin } = fixture;
const bytes = Uint8Array.from(atob(fixture.tiffBase64), (c) => c.charCodeAt(0));
const raster = parseGeoTiff(bytes.buffer);

describe('parseGeoTiff', () => {
	it('reads the tiled float32 raster and its georeference', () => {
		expect(raster.values).toHaveLength(raster.width * raster.height);
		expect(raster.width).toBeGreaterThan(raster.height); // square degrees are wider than tall here
		expect(raster.scaleX).toBeCloseTo(raster.scaleY, 12);
		// Covers the board: its left and top edges lie beyond 150 m from the origin
		expect(raster.west).toBeLessThan(origin.lng - 150 / 84_600);
		expect(raster.north).toBeGreaterThan(origin.lat + 150 / 111_000);
		for (const v of raster.values) expect(v).toBeGreaterThan(80);
	});

	it('rejects anything that is not a TIFF', () => {
		expect(() => parseGeoTiff(new TextEncoder().encode('{"error":{}}').buffer as ArrayBuffer)).toThrow('not a little-endian TIFF');
	});
});

describe('terrainFromRaster', () => {
	it('resamples onto the board grid, north row first', () => {
		const t = terrainFromRaster(raster, origin, 150)!;
		expect(t.spacing).toBe(TERRAIN_SPACING);
		expect(t.heights).toHaveLength(61 * 61);
		// About 20 m of relief across this board
		expect(Math.max(...t.heights) - Math.min(...t.heights)).toBeGreaterThan(10);
		for (const h of t.heights) expect(Math.round(h * 10) / 10).toBe(h);
	});

	it('matches the raster at a pixel center', () => {
		// The raster's own value nearest the origin agrees with the grid's center point
		const t = terrainFromRaster(raster, origin, 150)!;
		const c = Math.round((origin.lng - raster.west) / raster.scaleX - 0.5);
		const r = Math.round((raster.north - origin.lat) / raster.scaleY - 0.5);
		expect(t.heights[30 * 61 + 30]).toBeCloseTo(raster.values[r * raster.width + c], 0);
	});

	it('gives no terrain where there is no data', () => {
		const empty = { ...raster, values: raster.values.map(() => -3.4e38) };
		expect(terrainFromRaster(empty, origin, 150)).toBeNull();
	});
});

describe('terrainUrl', () => {
	it('asks for an uncompressed float32 TIFF around the board', () => {
		const url = new URL(terrainUrl(origin, 150));
		expect(url.searchParams.get('format')).toBe('tiff');
		expect(url.searchParams.get('compression')).toBe('None');
		const [w, s, e, n] = url.searchParams.get('bbox')!.split(',').map(Number);
		expect(w).toBeLessThan(origin.lng);
		expect(e).toBeGreaterThan(origin.lng);
		expect(s).toBeLessThan(origin.lat);
		expect(n).toBeGreaterThan(origin.lat);
	});
});
