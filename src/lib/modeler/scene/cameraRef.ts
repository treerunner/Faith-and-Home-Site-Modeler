import * as THREE from 'three';

export let planCamera: THREE.OrthographicCamera | null = null;
export let rendererEl: HTMLCanvasElement | null = null;

export function setPlanCamera(cam: THREE.OrthographicCamera): void {
	planCamera = cam;
}

export function setRendererEl(el: HTMLCanvasElement): void {
	rendererEl = el;
}

// Convert a client-space point to site coordinates (x = east, y = north).
// Returns null if the camera or canvas is not yet initialized.
export function clientToSite(clientX: number, clientY: number): { x: number; y: number } | null {
	if (!planCamera || !rendererEl) return null;
	const rect = rendererEl.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return null;
	const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
	const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), planCamera);
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const target = new THREE.Vector3();
	const hit = raycaster.ray.intersectPlane(plane, target);
	if (!hit) return null;
	return { x: hit.x, y: hit.z }; // site y maps to three.js z
}
