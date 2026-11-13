<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { COLORS } from '../colors';

	// A parcel boundary printed on the base board. Dashed for candidates while choosing.

	interface Props {
		polygon: [number, number][];
		dashed?: boolean;
		highlight?: boolean; // selection color
		fill?: boolean; // light tint inside
	}

	let { polygon, dashed = false, highlight = false, fill = false }: Props = $props();

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

	// A light tint marks selected parcels while choosing, and an outline being drawn
	let fillGeo = $derived.by(() => {
		if (!fill || polygon.length < 3) return null;
		const geo = new THREE.ShapeGeometry(new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x, y))));
		geo.rotateX(Math.PI / 2); // shape y -> site y (+Z)
		return geo;
	});
</script>

{#if fillGeo}
	<T.Mesh geometry={fillGeo} position={[0, Y - 0.01, 0]}>
		<T.MeshBasicMaterial color={COLORS.selection} transparent opacity={0.15} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
	</T.Mesh>
{/if}

<T.Line bind:ref={lineRef} geometry={geo}>
	{#if dashed}
		<T.LineDashedMaterial {color} dashSize={1.2} gapSize={0.8} />
	{:else}
		<T.LineBasicMaterial {color} />
	{/if}
</T.Line>
