import * as THREE from 'three';
import { getRenderer, getPerspCamera, planCamera, mainScene } from './scene/cameraRef';
import type { Site } from './types';

const PAD = 8;

export function capturePlanImage(site: Site): string | null {
	const renderer = getRenderer();
	const scene = mainScene;
	if (!renderer || !planCamera || !scene) return null;

	// Collect site content bounds (structures, open spaces, trees)
	const xs: number[] = [];
	const zs: number[] = [];

	for (const s of site.structures) {
		for (const p of s.parts) {
			xs.push(p.x - p.w / 2, p.x + p.w / 2);
			zs.push(p.y - p.d / 2, p.y + p.d / 2);
		}
	}
	for (const os of site.openSpaces) {
		for (const [ox, oz] of os.polygon) { xs.push(ox); zs.push(oz); }
	}
	for (const t of site.trees) {
		xs.push(t.x - t.radius, t.x + t.radius);
		zs.push(t.y - t.radius, t.y + t.radius);
	}

	// Hide grid lines during capture
	const grids = scene.children.filter((c) => c instanceof THREE.GridHelper);
	grids.forEach((g) => { g.visible = false; });

	let dataURL: string;

	if (xs.length === 0) {
		renderer.render(scene, planCamera);
		dataURL = renderer.domElement.toDataURL('image/png');
	} else {
		const minX = Math.min(...xs) - PAD, maxX = Math.max(...xs) + PAD;
		const minZ = Math.min(...zs) - PAD, maxZ = Math.max(...zs) + PAD;
		const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

		// Maintain renderer aspect ratio to avoid distortion
		const size = renderer.getSize(new THREE.Vector2());
		const aspect = size.x / size.y;
		let halfW = (maxX - minX) / 2;
		let halfD = (maxZ - minZ) / 2;
		if (halfW / halfD > aspect) halfD = halfW / aspect;
		else halfW = halfD * aspect;

		// Save and override frustum (camera top/bottom map to world +Z/−Z)
		const { left, right, top, bottom } = planCamera;
		planCamera.left   = cx - halfW;
		planCamera.right  = cx + halfW;
		planCamera.top    = -cz + halfD;  // view Y = world -Z, so top = -(cz - halfD)
		planCamera.bottom = -cz - halfD;
		planCamera.updateProjectionMatrix();

		renderer.render(scene, planCamera);
		dataURL = renderer.domElement.toDataURL('image/png');

		// Restore frustum
		planCamera.left = left; planCamera.right = right;
		planCamera.top = top;   planCamera.bottom = bottom;
		planCamera.updateProjectionMatrix();
	}

	grids.forEach((g) => { g.visible = true; });
	return dataURL;
}

export function exportPNG(filename = 'site-model.png') {
	const renderer = getRenderer();
	const camera = getPerspCamera();
	const scene = mainScene;
	if (!renderer || !camera || !scene) return;

	renderer.render(scene, camera);
	const dataURL = renderer.domElement.toDataURL('image/png');
	const a = document.createElement('a');
	a.href = dataURL;
	a.download = filename;
	a.click();
}
