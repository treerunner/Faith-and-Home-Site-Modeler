import * as THREE from 'three';
import { drapeLine, drapeTriangles, type TerrainSurface } from '../terrain';

type Pt = [number, number];
type P3 = [number, number, number]; // site x, site y, height

// Lays flat scene geometry (built on the board, y constant) onto the terrain surface: each
// triangle is split where it crosses surface triangles, and each piece follows the surface.
export function drapeGeometry(geo: THREE.BufferGeometry, surface: TerrainSurface): THREE.BufferGeometry {
	const pos = geo.getAttribute('position');
	const index = geo.getIndex();
	const count = index ? index.count : pos.count;
	const vertex = (k: number): Pt => {
		const v = index ? index.getX(k) : k;
		return [pos.getX(v), pos.getZ(v)];
	};
	const tris: [Pt, Pt, Pt][] = [];
	for (let k = 0; k + 2 < count; k += 3) tris.push([vertex(k), vertex(k + 1), vertex(k + 2)]);
	return piecesGeometry(drapeTriangles(surface, tris));
}

// Twice the signed area in site coordinates (x east, y south)
const signedArea = (poly: P3[]) => poly.reduce((a, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return a + x1 * y2 - x2 * y1; }, 0);

// Convex pieces as one triangle geometry, each fanned from its first point. Wound to face up: a
// face wound the other way faces down, and one-sided materials skip it from above.
export function piecesGeometry(pieces: P3[][]): THREE.BufferGeometry {
	const out: number[] = [];
	for (const piece of pieces) {
		const poly = signedArea(piece) > 0 ? [...piece].reverse() : piece;
		const [x0, y0, h0] = poly[0];
		for (let i = 1; i + 1 < poly.length; i++) {
			out.push(x0, h0, y0, poly[i][0], poly[i][2], poly[i][1], poly[i + 1][0], poly[i + 1][2], poly[i + 1][1]);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
	g.computeVertexNormals();
	return g;
}

// A polyline as segment pairs for LineSegments: flat at `y`, or on the surface raised by `y`
export function lineGeometry(points: Pt[], y: number, surface: TerrainSurface | null): THREE.BufferGeometry {
	const segs: { a: P3; b: P3 }[] = surface
		? drapeLine(surface, points)
		: points.slice(0, -1).map((a, i) => ({ a: [a[0], a[1], 0], b: [points[i + 1][0], points[i + 1][1], 0] }));
	return new THREE.BufferGeometry().setFromPoints(
		segs.flatMap(({ a, b }) => [new THREE.Vector3(a[0], a[2] + y, a[1]), new THREE.Vector3(b[0], b[2] + y, b[1])]),
	);
}
