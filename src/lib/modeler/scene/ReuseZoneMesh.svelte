<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Part, ReuseZone, Structure } from '../types';
	import { COLORS } from '../colors';
	import { zoneOutline } from '../geo';

	// A reuse zone in the reuse green. In 3D it is the slice of the building on the zone's
	// floors: drawn over the building's own faces where they coincide (walls, roof), and hidden
	// inside it elsewhere, like a green layer set into a chipboard model. In plan it is a fill.

	interface Props {
		zone: ReuseZone;
		part: Part;
		structure: Structure;
		is3D: boolean;
	}

	let { zone, part, structure, is3D }: Props = $props();

	const PLAN_Y = 0.11; // just above the part slab (0.1)
	const EDGE = '#2f7a5c';

	let outline = $derived(zoneOutline(zone, part));
	let shape = $derived(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))));

	// Floor 1 starts at ground level; floor 0 is the basement, below it
	let bottom = $derived((zone.floors[0] - 1) * structure.floorHeight);
	let top = $derived(zone.floors[1] * structure.floorHeight);

	let solid = $derived.by(() => {
		const depth = top - bottom;
		const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
		g.rotateX(Math.PI / 2); // shape y -> site y (+Z); extrusion runs down
		g.translate(0, top, 0);
		return g;
	});
	let solidEdges = $derived(new THREE.EdgesGeometry(solid));

	let flat = $derived.by(() => {
		const g = new THREE.ShapeGeometry(shape);
		g.rotateX(Math.PI / 2);
		return g;
	});
	let flatEdges = $derived(
		new THREE.BufferGeometry().setFromPoints([...outline, outline[0]].map(([x, z]) => new THREE.Vector3(x, PLAN_Y + 0.001, z))),
	);

	// Zones above the ground floor read as lighter in plan, with a dashed outline
	let upstairs = $derived(zone.floors[0] > 1);
	let dashRef: THREE.Line | undefined = $state();
	$effect(() => {
		if (dashRef && upstairs) dashRef.computeLineDistances();
	});
</script>

{#if is3D}
	<T.Mesh geometry={solid} castShadow>
		<T.MeshLambertMaterial color={COLORS.reuse} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
	</T.Mesh>
	<T.LineSegments geometry={solidEdges}>
		<T.LineBasicMaterial color={EDGE} />
	</T.LineSegments>
{:else}
	<T.Mesh geometry={flat} position={[0, PLAN_Y, 0]}>
		<T.MeshBasicMaterial color={COLORS.reuse} transparent opacity={upstairs ? 0.45 : 0.85} side={THREE.DoubleSide} depthWrite={false} />
	</T.Mesh>
	<T.Line bind:ref={dashRef} geometry={flatEdges}>
		{#if upstairs}
			<T.LineDashedMaterial color={EDGE} dashSize={0.6} gapSize={0.4} />
		{:else}
			<T.LineBasicMaterial color={EDGE} />
		{/if}
	</T.Line>
{/if}
