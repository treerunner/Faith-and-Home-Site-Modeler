<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import * as THREE from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { setPerspCamera, setRenderer, surfaceUnder, topBelow } from './cameraRef';
	import { store } from '../store.svelte';
	import { cameraFloor, zoomAbout, ZOOM_LIMITS } from '../view';

	const { size: sizeStore, renderer, invalidate } = useThrelte();

	let cam: THREE.PerspectiveCamera | undefined = $state();
	let controls: ThreeOrbitControls | undefined = $state();

	// Stop just short of level, and keep the camera above whatever is under it (raising it only
	// steepens the view), so the model is never seen from underneath or from inside a hill or a building
	const MAX_POLAR = (84 * Math.PI) / 180;
	$effect(() => {
		if (!controls || !cam) return;
		const c = controls, camera = cam;
		const keepAbove = () => {
			const { x, z } = camera.position;
			const floor = cameraFloor(store.ground, x, z, topBelow(x, z));
			if (camera.position.y < floor) {
				camera.position.y = floor;
				invalidate();
			}
		};
		c.addEventListener('change', keepAbove);
		return () => c.removeEventListener('change', keepAbove);
	});

	// The wheel (and trackpad pinch) zooms in toward what's under the cursor, and the orbit pivot
	// follows, so you can get close to any part of the model and then orbit around it. Zooming
	// out backs away from the pivot (backing away from a point near the horizon would fling the
	// view). Each wheel event adds to a pending zoom that glides in over a few frames.
	const WHEEL_SPEED = 0.0015; // per pixel of scroll: a mouse notch is about 12%
	const GLIDE = 0.25; // share of the pending zoom applied each frame
	let pending = $state(0); // log of the zoom factor still to apply
	let zoomPoint: THREE.Vector3 | null = null;

	$effect(() => {
		const el = (renderer as unknown as THREE.WebGLRenderer | undefined)?.domElement;
		if (!el || store.viewMode !== '3d') return;
		const onwheel = (e: WheelEvent) => {
			e.preventDefault();
			if (!controls) return;
			const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
			pending += px * WHEEL_SPEED;
			zoomPoint = (px < 0 && surfaceUnder(e.clientX, e.clientY)) || controls.target.clone();
		};
		el.addEventListener('wheel', onwheel, { passive: false });
		return () => el.removeEventListener('wheel', onwheel);
	});

	useTask(
		() => {
			if (!cam || !controls || !zoomPoint) return void (pending = 0);
			const step = Math.abs(pending) < 0.002 ? pending : pending * GLIDE;
			pending -= step;
			const p = cam.position, t = controls.target;
			const next = zoomAbout([p.x, p.y, p.z], [t.x, t.y, t.z], [zoomPoint.x, zoomPoint.y, zoomPoint.z], Math.exp(step), {
				...ZOOM_LIMITS,
				half: store.boardHalf,
			});
			p.set(...next.position);
			t.set(...next.target);
			controls.update();
		},
		{ running: () => pending !== 0 },
	);

	$effect(() => {
		if (!cam) return;
		const { width, height } = sizeStore.current;
		cam.aspect = height > 0 ? width / height : 1;
		cam.updateProjectionMatrix();
		setPerspCamera(cam);
	});

	$effect(() => {
		// renderer from useThrelte() is the WebGLRenderer directly in Threlte v8
		if (renderer) setRenderer(renderer as unknown as THREE.WebGLRenderer);
	});
</script>

<!-- near is 1 m, not 0.1: the extra depth precision keeps flush layers (board, road print,
     open spaces) from flickering at viewing distance -->
<T.PerspectiveCamera
	bind:ref={cam}
	makeDefault={store.viewMode === '3d'}
	fov={45}
	near={1}
	far={2000}
	position={[60, 80, 80]}
>
	<OrbitControls
		bind:ref={controls}
		enabled={store.viewMode === '3d'}
		enableDamping={true}
		target={[0, 0, 0]}
		maxPolarAngle={MAX_POLAR}
		enableZoom={false}
		minDistance={1}
		maxDistance={1500}
	/>
</T.PerspectiveCamera>
