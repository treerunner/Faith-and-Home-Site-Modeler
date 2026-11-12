<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import * as THREE from 'three';
	import { setPerspCamera, setRenderer } from './cameraRef';
	import { store } from '../store.svelte';

	const { size: sizeStore, renderer } = useThrelte();

	let cam: THREE.PerspectiveCamera | undefined = $state();

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
	<OrbitControls enabled={store.viewMode === '3d'} enableDamping={true} target={[0, 0, 0]} />
</T.PerspectiveCamera>
