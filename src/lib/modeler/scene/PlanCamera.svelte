<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { setPlanCamera } from './cameraRef';
	import { store } from '../store.svelte';

	// useThrelte().size is a CurrentReadable backed by a $state.raw; reading
	// .current inside $effect registers it as a reactive dependency.
	const { size: sizeStore } = useThrelte();

	let cam: THREE.OrthographicCamera | undefined = $state();

	$effect(() => {
		if (!cam) return;
		const { width, height } = sizeStore.current;
		const halfH = store.planViewHeight / 2; // meters visible top to bottom
		const halfW = height > 0 ? halfH * (width / height) : halfH;
		cam.left = -halfW;
		cam.right = halfW;
		cam.top = halfH;
		cam.bottom = -halfH;
		cam.position.set(0, 200, 0);
		cam.rotation.set(-Math.PI / 2, 0, 0);
		cam.updateProjectionMatrix();
		cam.updateMatrixWorld();
		setPlanCamera(cam);
	});
</script>

<!-- manual prevents Threlte's auto-resize from overriding our frustum -->
<T.OrthographicCamera makeDefault={store.viewMode === 'plan'} manual bind:ref={cam} near={0.1} far={1000} />
