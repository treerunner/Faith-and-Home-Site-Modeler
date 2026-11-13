import { toLatLng, type LatLng } from '../modeler/geo';
import type { Terrain, TerrainRegion } from '../modeler/types';
import { USER_AGENT } from './http';
import { decodePng } from './png';

// Ground elevation from the AWS Terrain Tiles (Mapzen's open dataset on AWS Open Data):
// "Terrarium" PNGs on S3, global, from USGS 3DEP in the US and national and global sources
// elsewhere, as of 2017. Plain files, so fast and steady; USGS's own service was not.

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const ZOOM = 15; // about 3.6 m pixels at 40°N, finer than the grid
const TILE = 256;
export const TERRAIN_SPACING = 5; // meters between grid points
const TIMEOUT_MS = 15_000;
const ATTEMPTS = 2;

// Global pixel position at ZOOM (Web Mercator)
export function toPixel({ lat, lng }: LatLng): [number, number] {
	const scale = TILE * 2 ** ZOOM;
	const s = Math.sin((lat * Math.PI) / 180);
	return [((lng + 180) / 360) * scale, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale];
}

// Terrarium heights: red and green are whole meters, offset by 32768; blue is 1/256 m
export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

// The tiles under the board, with a margin so edge points interpolate inside them
export function tilesFor(origin: LatLng, half: number): [number, number][] {
	const edge = half + TERRAIN_SPACING;
	const [x0, y0] = toPixel(toLatLng(-edge, -edge, origin));
	const [x1, y1] = toPixel(toLatLng(edge, edge, origin));
	const tiles: [number, number][] = [];
	for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++)
		for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) tiles.push([tx, ty]);
	return tiles;
}

export const tileUrl = ([x, y]: [number, number]) => `${TILE_URL}/${ZOOM}/${x}/${y}.png`;

// Rough boxes around the places whose national terrain sources ask for credit. Generous on
// purpose: crediting a source a site doesn't use is harmless; missing one is not.
const REGIONS: [TerrainRegion, south: number, west: number, north: number, east: number][] = [
	['au', -44, 112, -10, 154],
	['at', 46.3, 9.5, 49.1, 17.2],
	['ca', 41.6, -141, 83.2, -52],
	['eu', 34, -25, 72, 45],
	['mx', 14.5, -118.5, 32.8, -86.7],
	['nz', -47.5, 166, -34, 179],
	['no', 57.9, 4.5, 71.3, 31.2],
	['uk', 49.8, -8.7, 60.9, 1.8],
];

export function regionsAt({ lat, lng }: LatLng): TerrainRegion[] {
	return ['world', ...REGIONS.filter(([, s, w, n, e]) => lat >= s && lat <= n && lng >= w && lng <= e).map(([r]) => r)];
}

// Decoded tiles keyed "x,y", heights in meters
export type TileHeights = Map<string, Float32Array>;

export async function decodeTile(buf: ArrayBuffer): Promise<Float32Array> {
	const png = await decodePng(buf);
	if (png.width !== TILE || png.height !== TILE) throw new Error('unexpected terrain tile size');
	const out = new Float32Array(TILE * TILE);
	for (let i = 0; i < out.length; i++) {
		const o = i * png.channels;
		out[i] = terrariumHeight(png.data[o], png.data[o + 1], png.data[o + 2]);
	}
	return out;
}

// Resamples the tiles onto the board's grid: points from -half to +half every TERRAIN_SPACING m,
// row by row from north to south, rounded to 0.1 m. Below sea level is clamped to it: offshore
// the tiles carry the sea floor. Null if a point falls outside the tiles or has no data.
export function terrainFromTiles(tiles: TileHeights, origin: LatLng, half: number): Terrain | null {
	const n = Math.round((2 * half) / TERRAIN_SPACING) + 1;
	const at = (px: number, py: number): number => {
		const tile = tiles.get(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`);
		return tile ? tile[(py % TILE) * TILE + (px % TILE)] : NaN;
	};
	const heights: number[] = [];
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			// Pixel centers sit at half pixels
			const [gx, gy] = toPixel(toLatLng(-half + j * TERRAIN_SPACING, -half + i * TERRAIN_SPACING, origin));
			const px = gx - 0.5, py = gy - 0.5;
			const c = Math.floor(px), r = Math.floor(py);
			const fx = px - c, fy = py - r;
			const z = at(c, r) * (1 - fx) * (1 - fy) + at(c + 1, r) * fx * (1 - fy) + at(c, r + 1) * (1 - fx) * fy + at(c + 1, r + 1) * fx * fy;
			if (!Number.isFinite(z)) return null;
			heights.push(Math.round(Math.max(0, z) * 10) / 10);
		}
	}
	return { spacing: TERRAIN_SPACING, heights, regions: regionsAt(origin) };
}

// Null where a tile is missing; throws if the tiles can't be fetched twice
export async function fetchTerrain(origin: LatLng, half: number): Promise<Terrain | null> {
	const wanted = tilesFor(origin, half);
	for (let attempt = 1; ; attempt++) {
		try {
			const tiles: TileHeights = new Map();
			let missing = false;
			await Promise.all(
				wanted.map(async (t) => {
					const res = await fetch(tileUrl(t), { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
					// S3 answers 403 for a key that doesn't exist
					if (res.status === 404 || res.status === 403) missing = true;
					else if (!res.ok) throw new Error(`terrain tile returned ${res.status}`);
					else tiles.set(`${t[0]},${t[1]}`, await decodeTile(await res.arrayBuffer()));
				}),
			);
			return missing ? null : terrainFromTiles(tiles, origin, half);
		} catch (e) {
			if (attempt >= ATTEMPTS) throw e;
		}
	}
}
