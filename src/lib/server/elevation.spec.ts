import { describe, it, expect } from 'vitest';
import { decodePng } from './png';
import { decodeTile, regionsAt, terrainFromTiles, terrariumHeight, tilesFor, toPixel, TERRAIN_SPACING, type TileHeights } from './elevation';
import fixture from './fixtures/terrarium.json';

// Captured live from the AWS Terrain Tiles: the four zoom-15 tiles under a 150 m board around
// the church fixture's origin
const { origin } = fixture;
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
const tiles: TileHeights = new Map();
for (const t of fixture.tiles) tiles.set(`${t.x},${t.y}`, await decodeTile(bytesOf(t.pngBase64)));

// A PNG from rows of RGB bytes, each row with its own filter type: the filtered bytes are
// computed here the way an encoder would, so decoding must undo them exactly
async function makePng(rows: number[][], filters: number[]): Promise<ArrayBuffer> {
	const w = rows[0].length / 3, bpp = 3;
	const paeth = (a: number, b: number, c: number) => {
		const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
		return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
	};
	const raw: number[] = [];
	rows.forEach((row, y) => {
		raw.push(filters[y]);
		row.forEach((v, x) => {
			const a = x >= bpp ? row[x - bpp] : 0, b = y > 0 ? rows[y - 1][x] : 0, c = x >= bpp && y > 0 ? rows[y - 1][x - bpp] : 0;
			const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filters[y]];
			raw.push((v - predicted + 256) % 256);
		});
	});
	const deflated = new Uint8Array(await new Response(new Blob([new Uint8Array(raw)]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
	const chunk = (type: string, body: Uint8Array) => {
		const out = new Uint8Array(12 + body.length);
		new DataView(out.buffer).setUint32(0, body.length);
		out.set([...type].map((c) => c.charCodeAt(0)), 4);
		out.set(body, 8);
		return out; // CRC left zero: the reader doesn't check it
	};
	const ihdr = new Uint8Array(13);
	new DataView(ihdr.buffer).setUint32(0, w);
	new DataView(ihdr.buffer).setUint32(4, rows.length);
	ihdr.set([8, 2, 0, 0, 0], 8);
	const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', new Uint8Array())];
	const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	parts.reduce((at, p) => (png.set(p, at), at + p.length), 0);
	return png.buffer;
}

describe('decodePng', () => {
	it('undoes all five row filters', async () => {
		const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x * 37 + y * 91 + x * y * 13) % 256));
		const png = await decodePng(await makePng(rows, [0, 1, 2, 3, 4]));
		expect(png).toMatchObject({ width: 4, height: 5, channels: 3 });
		expect([...png.data]).toEqual(rows.flat());
	});

	it('reads a terrain tile', async () => {
		const png = await decodePng(bytesOf(fixture.tiles[0].pngBase64));
		expect(png).toMatchObject({ width: 256, height: 256, channels: 3 });
	});

	it('rejects anything that is not a PNG', async () => {
		await expect(decodePng(new TextEncoder().encode('<Error>NoSuchKey</Error>').buffer as ArrayBuffer)).rejects.toThrow('not a PNG');
	});
});

describe('terrain tiles', () => {
	it('decodes Terrarium heights', () => {
		expect(terrariumHeight(128, 0, 0)).toBe(0);
		expect(terrariumHeight(128, 100, 128)).toBe(100.5);
		expect(terrariumHeight(127, 255, 0)).toBe(-1);
	});

	it('finds the zoom-15 tiles under a board', () => {
		const [px, py] = toPixel({ lat: 40.6, lng: -75.47 });
		expect([Math.floor(px / 256), Math.floor(py / 256)]).toEqual([9514, 12333]);
		expect(tilesFor(origin, 150)).toEqual(fixture.tiles.map((t) => [t.x, t.y]));
	});

	it('resamples the tiles onto the board grid, across their seams', () => {
		const t = terrainFromTiles(tiles, origin, 150)!;
		expect(t.spacing).toBe(TERRAIN_SPACING);
		expect(t.heights).toHaveLength(61 * 61);
		expect(t.regions).toEqual(['world']);
		// About 19 m of relief, as USGS 3DEP measured here (within 6 cm on average)
		expect(Math.max(...t.heights) - Math.min(...t.heights)).toBeGreaterThan(15);
		// No step at a seam: neighboring points 5 m apart differ by what the ground does. The
		// steepest here is 2.3 m, an embankment USGS 3DEP also shows (2.2 m).
		for (let i = 0; i < 61; i++) for (let j = 1; j < 61; j++) expect(Math.abs(t.heights[i * 61 + j] - t.heights[i * 61 + j - 1])).toBeLessThan(3);
	});

	it('clamps the sea floor to sea level', () => {
		const sea: TileHeights = new Map([...tiles].map(([k, v]) => [k, v.map(() => -40)]));
		expect(new Set(terrainFromTiles(sea, origin, 150)!.heights)).toEqual(new Set([0]));
	});

	it('gives no terrain when a tile is missing', () => {
		const three: TileHeights = new Map([...tiles].slice(1));
		expect(terrainFromTiles(three, origin, 150)).toBeNull();
	});

	it('credits national sources where the site is', () => {
		expect(regionsAt(origin)).toEqual(['world']);
		expect(regionsAt({ lat: 51.5, lng: -0.13 })).toEqual(['world', 'eu', 'uk']);
		expect(regionsAt({ lat: 43.65, lng: -79.38 })).toEqual(['world', 'ca']);
	});
});
