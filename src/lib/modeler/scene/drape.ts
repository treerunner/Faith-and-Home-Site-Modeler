import * as THREE from 'three';
import { drapeLine, drapeTriangles, type TerrainModel } from '../terrain';

type Pt = [number, number];

// Lays flat scene geometry (built on the board, y constant) onto the terrain layers: each
// triangle is split where it crosses a layer edge, and each piece is raised to its layer.
export function drapeGeometry(geo: THREE.BufferGeometry, model: TerrainModel): THREE.BufferGeometry {
	const pos = geo.getAttribute('position');
	const index = geo.getIndex();
	const count = index ? index.count : pos.count;
	const vertex = (k: number): Pt => {
		const v = index ? index.getX(k) : k;
		return [pos.getX(v), pos.getZ(v)];
	};
	const tris: [Pt, Pt, Pt][] = [];
	for (let k = 0; k + 2 < count; k += 3) tris.push([vertex(k), vertex(k + 1), vertex(k + 2)]);
	return bandsGeometry(drapeTriangles(model, tris));
}

// Twice the signed area in site coordinates (x east, y south)
const signedArea = (poly: Pt[]) => poly.reduce((a, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return a + x1 * y2 - x2 * y1; }, 0);

// Pieces of layer tops as one triangle geometry, each fanned from its first point. Wound to face
// up: a face wound the other way faces down, and one-sided materials skip it from above.
export function bandsGeometry(bands: { y: number; polygon: Pt[] }[], lift = 0): THREE.BufferGeometry {
	const out: number[] = [];
	for (const band of bands) {
		const { y } = band;
		const polygon = signedArea(band.polygon) > 0 ? [...band.polygon].reverse() : band.polygon;
		const [x0, z0] = polygon[0];
		for (let i = 1; i + 1 < polygon.length; i++) {
			out.push(x0, y + lift, z0, polygon[i][0], y + lift, polygon[i][1], polygon[i + 1][0], y + lift, polygon[i + 1][1]);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
	g.computeVertexNormals();
	return g;
}

// A polyline as segment pairs for LineSegments: flat at `y`, or draped onto the layers
export function lineGeometry(points: Pt[], y: number, model: TerrainModel | null): THREE.BufferGeometry {
	const segs = model
		? drapeLine(model, points).map((s) => ({ ...s, y: s.y + y }))
		: points.slice(0, -1).map((a, i) => ({ y, a, b: points[i + 1] }));
	return new THREE.BufferGeometry().setFromPoints(
		segs.flatMap((s) => [new THREE.Vector3(s.a[0], s.y, s.a[1]), new THREE.Vector3(s.b[0], s.y, s.b[1])]),
	);
}
