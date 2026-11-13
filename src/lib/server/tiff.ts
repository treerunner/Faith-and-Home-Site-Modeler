// A minimal GeoTIFF reader for what USGS 3DEP exportImage sends: little-endian, uncompressed,
// one band of float32, in tiles or strips, georeferenced in degrees. Anything else throws.

export interface GeoRaster {
	width: number;
	height: number;
	values: Float32Array; // row by row from the top (north)
	west: number; // longitude of the raster's left edge
	north: number; // latitude of its top edge
	scaleX: number; // degrees per pixel
	scaleY: number;
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };

export function parseGeoTiff(buf: ArrayBuffer): GeoRaster {
	const view = new DataView(buf);
	if (view.getUint16(0) !== 0x4949 || view.getUint16(2, true) !== 42) throw new Error('not a little-endian TIFF');
	const ifd = view.getUint32(4, true);

	const tags = new Map<number, number[]>();
	const count = view.getUint16(ifd, true);
	for (let i = 0; i < count; i++) {
		const entry = ifd + 2 + i * 12;
		const tag = view.getUint16(entry, true);
		const type = view.getUint16(entry + 2, true);
		const n = view.getUint32(entry + 4, true);
		const size = TYPE_SIZES[type];
		if (!size || type === 2) continue; // ASCII and unknown types aren't needed
		const at = n * size <= 4 ? entry + 8 : view.getUint32(entry + 8, true);
		const read = (k: number) => {
			const o = at + k * size;
			switch (type) {
				case 1: return view.getUint8(o);
				case 3: return view.getUint16(o, true);
				case 4: return view.getUint32(o, true);
				case 12: return view.getFloat64(o, true);
				default: return Number(view.getBigUint64(o, true));
			}
		};
		tags.set(tag, Array.from({ length: n }, (_, k) => read(k)));
	}
	const one = (tag: number, fallback?: number) => {
		const v = tags.get(tag)?.[0] ?? fallback;
		if (v === undefined) throw new Error(`TIFF tag ${tag} missing`);
		return v;
	};

	const width = one(256);
	const height = one(257);
	if (one(258) !== 32 || one(339, 1) !== 3 || one(277, 1) !== 1) throw new Error('expected one band of float32');
	if (one(259, 1) !== 1) throw new Error('expected an uncompressed TIFF');

	// Tiles or strips: each block is blockW x blockH pixels, placed left to right, top to bottom
	const tiled = tags.has(322);
	const blockW = tiled ? one(322) : width;
	const blockH = tiled ? one(323) : one(278, height);
	const offsets = tags.get(tiled ? 324 : 273);
	if (!offsets) throw new Error('TIFF has no data offsets');
	const across = Math.ceil(width / blockW);

	const values = new Float32Array(width * height);
	offsets.forEach((offset, b) => {
		const bx = (b % across) * blockW;
		const by = Math.floor(b / across) * blockH;
		for (let r = 0; r < blockH && by + r < height; r++) {
			for (let c = 0; c < blockW && bx + c < width; c++) {
				values[(by + r) * width + bx + c] = view.getFloat32(offset + (r * blockW + c) * 4, true);
			}
		}
	});

	// ModelPixelScale and ModelTiepoint: pixel (i, j) at the tie point's lng/lat. 3DEP ties the
	// top-left corner of the top-left pixel (PixelIsArea).
	const scale = tags.get(33550);
	const tie = tags.get(33922);
	if (!scale || !tie) throw new Error('TIFF is not georeferenced');
	const [i, j, , lng, lat] = tie;
	return { width, height, values, west: lng - i * scale[0], north: lat + j * scale[1], scaleX: scale[0], scaleY: scale[1] };
}
