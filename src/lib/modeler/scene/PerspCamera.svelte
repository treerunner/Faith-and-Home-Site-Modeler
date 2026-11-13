<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import * as THREE from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { setPerspCamera, setRenderer, topBelow } from './cameraRef';
	import { store } from '../store.svelte';
	import { cameraFloor } from '../view';

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
		minDistance={15}
		maxDistance={1500}
	/>
</T.PerspectiveCamera>
