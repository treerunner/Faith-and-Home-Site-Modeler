import * as THREE from 'three';

export let planCamera: THREE.OrthographicCamera | null = null;
export let rendererEl: HTMLCanvasElement | null = null;
export let mainScene: THREE.Scene | null = null;
let perspCamera: THREE.PerspectiveCamera | null = null;
let mainRenderer: THREE.WebGLRenderer | null = null;

export function setPlanCamera(cam: THREE.OrthographicCamera): void {
	planCamera = cam;
}
export function setRendererEl(el: HTMLCanvasElement): void {
	rendererEl = el;
}
export function setMainScene(s: THREE.Scene): void {
	mainScene = s;
}
export function setPerspCamera(cam: THREE.PerspectiveCamera): void {
	perspCamera = cam;
}
export function setRenderer(r: THREE.WebGLRenderer): void {
	mainRenderer = r;
}
export function getRenderer(): THREE.WebGLRenderer | null {
	return mainRenderer;
}
export function getPerspCamera(): THREE.PerspectiveCamera | null {
	return perspCamera;
}

export type HitResult =
	| { kind: 'part'; partId: string; x: number; y: number }
	| { kind: 'resize'; partId: string; handle: string }
	| { kind: 'rotate'; partId: string; x: number; y: number }
	| { kind: 'openSpace'; openSpaceId: string; x: number; y: number }
	| { kind: 'osVertex'; openSpaceId: string; vertexIndex: number }
	| { kind: 'tree'; treeId: string; x: number; y: number }
	| { kind: 'ground'; x: number; y: number };

// The highest visible surface of the model straight below (x, z), or null over nothing
const down = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
export function topBelow(x: number, z: number): number | null {
	if (!mainScene) return null;
	down.ray.origin.set(x, 10000, z);
	for (const hit of down.intersectObjects(mainScene.children, true)) {
		const obj = hit.object as THREE.Mesh;
		const material = obj.material as THREE.Material | undefined;
		if (obj.isMesh && material?.visible !== false) return hit.point.y;
	}
	return null;
}

function makeRaycaster(clientX: number, clientY: number): THREE.Raycaster | null {
	if (!planCamera || !rendererEl) return null;
	const rect = rendererEl.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return null;
	const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
	const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
	const rc = new THREE.Raycaster();
	rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), planCamera);
	return rc;
}

// Hit-test: returns the nearest interactive object under the pointer.
// Falls through to a ground-plane intersection when no part/handle is hit.
export function hitTest(clientX: number, clientY: number): HitResult | null {
	const rc = makeRaycaster(clientX, clientY);
	if (!rc) return null;

	if (mainScene) {
		const hits = rc.intersectObjects(mainScene.children, true);
		for (const hit of hits) {
			const ud = hit.object.userData as Record<string, unknown>;
			if (ud.rotateHandle === true && typeof ud.partId === 'string') {
				return { kind: 'rotate', partId: ud.partId, x: hit.point.x, y: hit.point.z };
			}
			if (typeof ud.handle === 'string' && typeof ud.partId === 'string') {
				return { kind: 'resize', partId: ud.partId, handle: ud.handle };
			}
			if (typeof ud.partId === 'string') {
				return { kind: 'part', partId: ud.partId, x: hit.point.x, y: hit.point.z };
			}
			if (typeof ud.openSpaceId === 'string' && typeof ud.osVertex === 'number') {
				return { kind: 'osVertex', openSpaceId: ud.openSpaceId, vertexIndex: ud.osVertex };
			}
			if (typeof ud.openSpaceId === 'string') {
				return { kind: 'openSpace', openSpaceId: ud.openSpaceId, x: hit.point.x, y: hit.point.z };
			}
			if (typeof ud.treeId === 'string') {
				return { kind: 'tree', treeId: ud.treeId, x: hit.point.x, y: hit.point.z };
			}
		}
	}

	// Ground plane fallback
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const target = new THREE.Vector3();
	const groundHit = rc.ray.intersectPlane(plane, target);
	if (!groundHit) return null;
	return { kind: 'ground', x: groundHit.x, y: groundHit.z };
}

// Project a world (site) point to screen (client) coordinates.
// Pass a camera to override the default plan camera (e.g. persp cam in 3D mode).
export function worldToScreen(wx: number, wz: number, cam?: THREE.Camera): { x: number; y: number } | null {
	const camera = cam ?? planCamera;
	if (!camera || !rendererEl) return null;
	const v = new THREE.Vector3(wx, 0, wz).project(camera);
	if (v.z > 1) return null; // behind camera
	const rect = rendererEl.getBoundingClientRect();
	return {
		x: rect.left + ((v.x + 1) / 2) * rect.width,
		y: rect.top + ((-v.y + 1) / 2) * rect.height,
	};
}

// Convenience: just the site coordinates of the ground intersection.
export function clientToSite(clientX: number, clientY: number): { x: number; y: number } | null {
	const rc = makeRaycaster(clientX, clientY);
	if (!rc) return null;
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const target = new THREE.Vector3();
	const hit = rc.ray.intersectPlane(plane, target);
	if (!hit) return null;
	return { x: hit.x, y: hit.z };
}
