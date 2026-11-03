import * as THREE from 'three';

export let planCamera: THREE.OrthographicCamera | null = null;
export let rendererEl: HTMLCanvasElement | null = null;
export let mainScene: THREE.Scene | null = null;

export function setPlanCamera(cam: THREE.OrthographicCamera): void {
	planCamera = cam;
}
export function setRendererEl(el: HTMLCanvasElement): void {
	rendererEl = el;
}
export function setMainScene(s: THREE.Scene): void {
	mainScene = s;
}

export type HitResult =
	| { kind: 'part'; partId: string; x: number; y: number }
	| { kind: 'resize'; partId: string; handle: string }
	| { kind: 'rotate'; partId: string; x: number; y: number }
	| { kind: 'ground'; x: number; y: number };

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
		}
	}

	// Ground plane fallback
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const target = new THREE.Vector3();
	const groundHit = rc.ray.intersectPlane(plane, target);
	if (!groundHit) return null;
	return { kind: 'ground', x: groundHit.x, y: groundHit.z };
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
