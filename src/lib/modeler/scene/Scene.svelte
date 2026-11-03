<script lang="ts">
	import { Canvas, T } from '@threlte/core';
	import PlanCamera from './PlanCamera.svelte';
	import SceneSetup from './SceneSetup.svelte';
	import PartMesh from './PartMesh.svelte';
	import ResizeHandles from './ResizeHandles.svelte';
	import GroundPlane from './GroundPlane.svelte';
	import { store } from '../store.svelte';
	import { COLORS } from '../colors';
	import { setRendererEl } from './cameraRef';

	interface Props {
		ondragover: (e: DragEvent) => void;
		ondrop: (e: DragEvent) => void;
		ondragleave: (e: DragEvent) => void;
		onpointermove: (e: PointerEvent) => void;
		onpointerup: (e: PointerEvent) => void;
	}

	let { ondragover, ondrop, ondragleave, onpointermove, onpointerup }: Props = $props();

	let wrapperEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (wrapperEl) {
			const canvas = wrapperEl.querySelector('canvas');
			if (canvas) setRendererEl(canvas as HTMLCanvasElement);
		}
	});

	let allParts = $derived(store.site.structures.flatMap((s) => s.parts));
	let ghostPart = $derived(
		store.mode.type === 'placing'
			? ({
					id: '__ghost__',
					shape: store.mode.shape,
					x: store.mode.ghostX,
					y: store.mode.ghostY,
					w: store.mode.shape === 'rect' ? 10 : 6,
					d: 6,
					rotation: 0,
				} as const)
			: null,
	);
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
>
	<Canvas>
		<SceneSetup />
		<PlanCamera />

		<!-- Warm key light -->
		<T.DirectionalLight position={[10, 20, 10]} intensity={1.2} color="#fff8f0" />
		<T.AmbientLight intensity={0.6} color="#f5f0e8" />

		<!-- Meter grid -->
		<T.GridHelper
			args={[120, 120, COLORS.grid, COLORS.gridSub]}
			position={[0, 0, 0]}
		/>

		<!-- Parts -->
		{#each allParts as part (part.id)}
			<PartMesh {part} selected={store.selectedPartId === part.id} />
		{/each}

		<!-- Ghost during palette drag -->
		{#if ghostPart}
			<PartMesh part={ghostPart} selected={false} ghost />
		{/if}

		<!-- Resize + rotate handles for selected part -->
		{#if store.selectedPart}
			<ResizeHandles part={store.selectedPart} />
		{/if}

		<GroundPlane />
	</Canvas>
</div>

<style>
	.scene-canvas {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
