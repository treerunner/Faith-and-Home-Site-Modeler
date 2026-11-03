<script lang="ts">
	// Rendered inside <Canvas> — useThrelte() is valid here.
	import { T, useThrelte } from '@threlte/core';
	import PlanCamera from './PlanCamera.svelte';
	import PartMesh from './PartMesh.svelte';
	import ResizeHandles from './ResizeHandles.svelte';
	import { store } from '../store.svelte';
	import { COLORS } from '../colors';
	import { setMainScene } from './cameraRef';

	const { scene } = useThrelte();

	$effect(() => {
		setMainScene(scene);
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

<PlanCamera />

<T.DirectionalLight position={[10, 20, 10]} intensity={1.2} color="#fff8f0" />
<T.AmbientLight intensity={0.6} color="#f5f0e8" />

<T.GridHelper args={[120, 120, COLORS.grid, COLORS.gridSub]} position={[0, 0, 0]} />

{#each allParts as part (part.id)}
	<PartMesh {part} selected={store.selectedPartId === part.id} />
{/each}

{#if ghostPart}
	<PartMesh part={ghostPart} selected={false} ghost />
{/if}

{#if store.selectedPart}
	<ResizeHandles part={store.selectedPart} />
{/if}
