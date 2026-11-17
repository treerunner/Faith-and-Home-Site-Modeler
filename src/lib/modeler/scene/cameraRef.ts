import * as THREE from 'three';
import { getContext } from 'svelte';

// One canvas: its element, scene, renderer and cameras. The editor draws one (`mainView`);
// compare mode draws two, each with its own. Code that needs a camera, the scene or the
// canvas takes the view it works in, defaulting to the editor's.
export interface SceneView {
	el: HTMLCanvasElement | null;
	scene: THREE.Scene | null;
	renderer: THREE.WebGLRenderer | null;
	planCamera: THREE.OrthographicCamera | null;
	perspCamera: THREE.PerspectiveCamera | null;
}

export function sceneView(): SceneView {
	return { el: null, scene: null, renderer: null, planCamera: null, perspCamera: null };
}

export const mainView: SceneView = sceneView();

// The view a Scene's pieces register into, passed down by context
export const SCENE_VIEW = Symbol('sceneView');
export function useSceneView(): SceneView {
	return getContext<SceneView | undefined>(SCENE_VIEW) ?? mainView;
}

// Two views orbiting together (compare): the last orbit, and which view made it
export interface OrbitSync {
	position: [number, number, number];
	target: [number, number, number];
	source: SceneView | null;
	version: number;
}

export function getRenderer(view = mainView): THREE.WebGLRenderer | null {
	return view.renderer;
}
export function getPerspCamera(view = mainView): THREE.PerspectiveCamera | null {
	return view.perspCamera;
}

export type HitResult =
	| { kind: 'part'; partId: string; x: number; y: number }
	| { kind: 'resize'; partId: string; handle: string }
	| { kind: 'rotate'; partId: string; x: number; y: number }
	| { kind: 'openSpace'; openSpaceId: string; x: number; y: number }
	| { kind: 'osVertex'; openSpaceId: string; vertexIndex: number }
	| { kind: 'vertex'; partId: string; index: number; insert: boolean }
	| { kind: 'tree'; treeId: string; x: number; y: number }
	| { kind: 'ground'; x: number; y: number };

// The first visible surface of the model a ray meets (not lines, not invisible hit planes)
function firstSurface(rc: THREE.Raycaster, view: SceneView): THREE.Vector3 | null {
	if (!view.scene) return null;
	for (const hit of rc.intersectObjects(view.scene.children, true)) {
		const obj = hit.object as THREE.Mesh;
		const material = obj.material as THREE.Material | undefined;
		if (obj.isMesh && material?.visible !== false) return hit.point;
	}
	return null;
}

// The highest visible surface of the model straight below (x, z), or null over nothing
const down = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
export function topBelow(x: number, z: number, view = mainView): number | null {
	down.ray.origin.set(x, 10000, z);
	return firstSurface(down, view)?.y ?? null;
}

// 3D: the surface of the model under the cursor, or null over the backdrop
const pick = new THREE.Raycaster();
export function surfaceUnder(clientX: number, clientY: number, view = mainView): THREE.Vector3 | null {
	const { perspCamera, el } = view;
	if (!perspCamera || !el) return null;
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return null;
	const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
	pick.setFromCamera(ndc, perspCamera);
	return firstSurface(pick, view)?.clone() ?? null;
}

function makeRaycaster(clientX: number, clientY: number, view: SceneView): THREE.Raycaster | null {
	const { planCamera, el } = view;
	if (!planCamera || !el) return null;
	const rect = el.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return null;
	const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
	const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
	const rc = new THREE.Raycaster();
	rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), planCamera);
	return rc;
}

// Hit-test: returns the nearest interactive object under the pointer.
// Falls through to a ground-plane intersection when no part/handle is hit.
export function hitTest(clientX: number, clientY: number, view = mainView): HitResult | null {
	const rc = makeRaycaster(clientX, clientY, view);
	if (!rc) return null;

	if (view.scene) {
		const hits = rc.intersectObjects(view.scene.children, true);
		for (const hit of hits) {
			const ud = hit.object.userData as Record<string, unknown>;
			if (ud.rotateHandle === true && typeof ud.partId === 'string') {
				return { kind: 'rotate', partId: ud.partId, x: hit.point.x, y: hit.point.z };
			}
			if (typeof ud.vertexPartId === 'string' && typeof ud.vertexIndex === 'number') {
				return { kind: 'vertex', partId: ud.vertexPartId, index: ud.vertexIndex, insert: false };
			}
			if (typeof ud.vertexPartId === 'string' && typeof ud.insertAfter === 'number') {
				return { kind: 'vertex', partId: ud.vertexPartId, index: ud.insertAfter, insert: true };
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
// Pass a camera to override the view's plan camera (e.g. persp cam in 3D mode).
export function worldToScreen(wx: number, wz: number, cam?: THREE.Camera, wy = 0, view = mainView): { x: number; y: number } | null {
	const camera = cam ?? view.planCamera;
	if (!camera || !view.el) return null;
	const v = new THREE.Vector3(wx, wy, wz).project(camera);
	if (v.z > 1) return null; // behind camera
	const rect = view.el.getBoundingClientRect();
	return {
		x: rect.left + ((v.x + 1) / 2) * rect.width,
		y: rect.top + ((-v.y + 1) / 2) * rect.height,
	};
}

// Convenience: just the site coordinates of the ground intersection.
export function clientToSite(clientX: number, clientY: number, view = mainView): { x: number; y: number } | null {
	const rc = makeRaycaster(clientX, clientY, view);
	if (!rc) return null;
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const target = new THREE.Vector3();
	const hit = rc.ray.intersectPlane(plane, target);
	if (!hit) return null;
	return { x: hit.x, y: hit.z };
}
