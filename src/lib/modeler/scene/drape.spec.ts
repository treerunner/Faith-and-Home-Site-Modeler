import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { drapeGeometry, piecesGeometry } from './drape';
import { terrainModel, terrainSurface } from '../terrain';

type Pt = [number, number];

// Every triangle's face normal, from its winding (zero-area slivers left out)
function faceNormalsY(geo: THREE.BufferGeometry): number[] {
	const pos = geo.getAttribute('position');
	const ys: number[] = [];
	const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
	for (let i = 0; i < pos.count; i += 3) {
		a.fromBufferAttribute(pos, i);
		b.fromBufferAttribute(pos, i + 1);
		c.fromBufferAttribute(pos, i + 2);
		const t = new THREE.Triangle(a, b, c);
		if (t.getArea() > 1e-9) ys.push(t.getNormal(new THREE.Vector3()).y); // slivers have no normal
	}
	return ys;
}

describe('piecesGeometry', () => {
	it('faces every piece up, whichever way its outline winds', () => {
		const square: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 1], [0, 10, 1]];
		const ys = faceNormalsY(piecesGeometry([square, [...square].reverse()]));
		expect(ys).toHaveLength(4);
		for (const y of ys) expect(y).toBeGreaterThan(0.9);
	});
});

describe('the terrain surface', () => {
	it('faces the ground and draped shapes up', () => {
		const n = 21, heights: number[] = [];
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(100 + i * 0.5 + Math.sin(j / 3));
		const model = terrainModel({ spacing: 5, heights }, 50)!;
		const surface = terrainSurface(model);
		const ground = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
		for (const y of faceNormalsY(ground)) expect(y).toBeGreaterThan(0);
		const road = new THREE.PlaneGeometry(20, 6).rotateX(-Math.PI / 2);
		for (const y of faceNormalsY(drapeGeometry(road, surface))) expect(y).toBeGreaterThan(0);
	});
});
