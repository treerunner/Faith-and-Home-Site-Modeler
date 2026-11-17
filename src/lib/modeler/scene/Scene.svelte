<script lang="ts">
	import { Canvas } from '@threlte/core';
	import SceneRoot from './SceneRoot.svelte';
	import { setContext, type Snippet } from 'svelte';
	import { mainView, SCENE_VIEW, type SceneView } from './cameraRef';

	interface Props {
		ondragover?: (e: DragEvent) => void;
		ondrop?: (e: DragEvent) => void;
		ondragleave?: (e: DragEvent) => void;
		onpointermove?: (e: PointerEvent) => void;
		onpointerup?: (e: PointerEvent) => void;
		onpointerdown?: (e: PointerEvent) => void;
		onwheel: (e: WheelEvent) => void;
		ondblclick?: (e: MouseEvent) => void;
		view?: SceneView;
		label?: string;
		children?: Snippet; // the scene's content; the editor's by default
	}

	let {
		ondragover,
		ondrop,
		ondragleave,
		onpointermove,
		onpointerup,
		onpointerdown,
		onwheel,
		ondblclick,
		view = mainView,
		label = 'Site plan editor canvas',
		children,
	}: Props = $props();
	// svelte-ignore state_referenced_locally
	setContext(SCENE_VIEW, view);

	// Attached by hand: Svelte makes wheel listeners passive, and zooming must preventDefault
	$effect(() => {
		if (!wrapperEl) return;
		const el = wrapperEl;
		el.addEventListener('wheel', onwheel, { passive: false });
		return () => el.removeEventListener('wheel', onwheel);
	});

	let wrapperEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (wrapperEl) {
			const canvas = wrapperEl.querySelector('canvas');
			if (canvas) view.el = canvas as HTMLCanvasElement;
		}
	});
</script>

<div
	bind:this={wrapperEl}
	class="scene-canvas"
	role="application"
	aria-label={label}
	{ondragover}
	{ondrop}
	{ondragleave}
	{onpointermove}
	{onpointerup}
	{onpointerdown}
	{ondblclick}
>
	<Canvas shadows>
		{#if children}{@render children()}{:else}<SceneRoot />{/if}
	</Canvas>
</div>

<style>
	.scene-canvas {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
