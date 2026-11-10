<script lang="ts">
	import { Canvas } from '@threlte/core';
	import SceneRoot from './SceneRoot.svelte';
	import { setRendererEl } from './cameraRef';

	interface Props {
		ondragover: (e: DragEvent) => void;
		ondrop: (e: DragEvent) => void;
		ondragleave: (e: DragEvent) => void;
		onpointermove: (e: PointerEvent) => void;
		onpointerup: (e: PointerEvent) => void;
		onpointerdown: (e: PointerEvent) => void;
	}

	let { ondragover, ondrop, ondragleave, onpointermove, onpointerup, onpointerdown }: Props =
		$props();

	let wrapperEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (wrapperEl) {
			const canvas = wrapperEl.querySelector('canvas');
			if (canvas) setRendererEl(canvas as HTMLCanvasElement);
		}
	});
</script>

<div
	bind:this={wrapperEl}
	class="scene-canvas"
	role="application"
	aria-label="Site plan editor canvas"
	{ondragover}
	{ondrop}
	{ondragleave}
	{onpointermove}
	{onpointerup}
	{onpointerdown}
>
	<Canvas shadows>
		<SceneRoot />
	</Canvas>
</div>

<style>
	.scene-canvas {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
