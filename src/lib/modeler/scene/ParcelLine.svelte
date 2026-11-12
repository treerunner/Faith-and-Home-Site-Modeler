<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { COLORS } from '../colors';

	// A parcel boundary printed on the base board. Dashed for candidates while choosing.

	interface Props {
		polygon: [number, number][];
		dashed?: boolean;
		highlight?: boolean;
	}

	let { polygon, dashed = false, highlight = false }: Props = $props();

	const Y = 0.03;

	let geo = $derived(
		new THREE.BufferGeometry().setFromPoints(
			[...polygon, polygon[0]].map(([x, z]) => new THREE.Vector3(x, Y, z)),
		),
	);

	let lineRef: THREE.Line | undefined = $state();
	$effect(() => {
		if (lineRef && dashed) lineRef.computeLineDistances();
	});

	let color = $derived(highlight ? COLORS.selection : COLORS.parcel);
</script>

<T.Line bind:ref={lineRef} geometry={geo}>
	{#if dashed}
		<T.LineDashedMaterial {color} dashSize={1.2} gapSize={0.8} />
	{:else}
		<T.LineBasicMaterial {color} />
	{/if}
</T.Line>
