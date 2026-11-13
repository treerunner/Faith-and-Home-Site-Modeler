import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bandsGeometry, drapeGeometry } from './drape';
import { terrainModel } from '../terrain';

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

describe('bandsGeometry', () => {
	it('faces every layer top up, whichever way its outline winds', () => {
		const square: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
		const geo = bandsGeometry([{ y: 0, polygon: square }, { y: 1, polygon: [...square].reverse() }]);
		const ys = faceNormalsY(geo);
		expect(ys).toHaveLength(4);
		for (const y of ys) expect(y).toBeCloseTo(1);
	});

	it('faces the terrain layers up', () => {
		const n = 21, heights: number[] = [];
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(100 + i * 0.5 + Math.sin(j / 3));
		const model = terrainModel({ spacing: 5, heights }, 50)!;
		for (const y of faceNormalsY(bandsGeometry(model.bands))) expect(y).toBeCloseTo(1);
		const road = new THREE.PlaneGeometry(20, 6).rotateX(-Math.PI / 2);
		for (const y of faceNormalsY(drapeGeometry(road, model))) expect(y).toBeCloseTo(1);
	});
});
