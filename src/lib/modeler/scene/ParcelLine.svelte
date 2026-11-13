<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { COLORS } from '../colors';
	import { store } from '../store.svelte';
	import { drapeGeometry, lineGeometry } from './drape';

	// A parcel boundary printed on the base board. Dashed for candidates while choosing.

	interface Props {
		polygon: [number, number][];
		dashed?: boolean;
		highlight?: boolean; // selection color
		fill?: boolean; // light tint inside
		color?: string; // overrides the parcel or selection color
	}

	let { polygon, dashed = false, highlight = false, fill = false, color: colorOverride }: Props = $props();

	const Y = 0.03;

	// In 3D on terrain, laid onto the layers
	let geo = $derived(lineGeometry([...polygon, polygon[0]], Y, store.terrain3D));

	let lineRef: THREE.LineSegments | undefined = $state();
	$effect(() => {
		if (lineRef && dashed) lineRef.computeLineDistances();
	});

	let color = $derived(colorOverride ?? (highlight ? COLORS.selection : COLORS.parcel));

	// A light tint marks selected parcels while choosing, and an outline being drawn
	let fillGeo = $derived.by(() => {
		if (!fill || polygon.length < 3) return null;
		const geo = new THREE.ShapeGeometry(new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x, y))));
		geo.rotateX(Math.PI / 2); // shape y -> site y (+Z)
		return store.terrain3D ? drapeGeometry(geo, store.terrain3D) : geo;
	});
</script>

{#if fillGeo}
	<T.Mesh geometry={fillGeo} position={[0, Y - 0.01, 0]}>
		<T.MeshBasicMaterial {color} transparent opacity={0.15} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
	</T.Mesh>
{/if}

<T.LineSegments bind:ref={lineRef} geometry={geo}>
	{#if dashed}
		<T.LineDashedMaterial {color} dashSize={1.2} gapSize={0.8} />
	{:else}
		<T.LineBasicMaterial {color} />
	{/if}
</T.LineSegments>
