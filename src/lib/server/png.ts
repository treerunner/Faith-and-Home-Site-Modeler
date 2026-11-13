// A minimal PNG reader for terrain tiles: 8-bit RGB or RGBA, not interlaced. Inflates with the
// web-standard DecompressionStream ('deflate' is the zlib format PNG uses). Anything else throws.

export interface Png {
	width: number;
	height: number;
	channels: 3 | 4;
	data: Uint8Array; // row by row, `channels` bytes per pixel
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(buf: ArrayBuffer): Promise<Png> {
	const bytes = new Uint8Array(buf);
	const view = new DataView(buf);
	if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');

	let width = 0, height = 0, channels: 3 | 4 = 3;
	const chunks: Uint8Array[] = [];
	for (let at = 8; at + 8 <= bytes.length; ) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		const body = bytes.subarray(at + 8, at + 8 + length);
		if (type === 'IHDR') {
			width = view.getUint32(at + 8);
			height = view.getUint32(at + 12);
			const [depth, color, , , interlace] = body.subarray(8, 13);
			if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) throw new Error('expected an 8-bit RGB or RGBA PNG, not interlaced');
			channels = color === 2 ? 3 : 4;
		} else if (type === 'IDAT') chunks.push(body);
		else if (type === 'IEND') break;
		at += 12 + length;
	}
	if (!width || !chunks.length) throw new Error('PNG has no image');

	const compressed = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	chunks.reduce((at, c) => (compressed.set(c, at), at + c.length), 0);
	const raw = await inflate(compressed);

	// Undo each row's filter: every byte is predicted from its left (a), up (b) and up-left (c)
	const stride = width * channels;
	const data = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		if (filter > 4) throw new Error(`unknown PNG filter ${filter}`);
		const src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? data[row + x - channels] : 0;
			const b = y > 0 ? data[prev + x] : 0;
			const c = x >= channels && y > 0 ? data[prev + x - channels] : 0;
			const v = raw[src + x];
			data[row + x] = // Uint8Array wraps sums past 255, as PNG specifies
				filter === 0 ? v
				: filter === 1 ? v + a
				: filter === 2 ? v + b
				: filter === 3 ? v + ((a + b) >> 1)
				: v + paeth(a, b, c);
		}
	}
	return { width, height, channels, data };
}
