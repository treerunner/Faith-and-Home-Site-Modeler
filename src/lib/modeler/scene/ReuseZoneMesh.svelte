<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Part, ReuseZone, Structure } from '../types';
	import { COLORS } from '../colors';
	import { offsetPolygon, zoneOutline } from '../geo';
	import { totalStories } from '../geometry';

	// A reuse zone in the reuse green. In 3D it is the slice of the building on the zone's
	// floors, set a few centimeters proud of the walls (and roof, when it reaches the top), so it
	// shows wherever the zone meets the outside and stays hidden inside the building elsewhere:
	// a green layer set into a chipboard model. Sharing the walls' exact surface made the two
	// flicker. In plan it is a fill.
	// A building's floors are one stack: its own, then any a plan added to the whole building,
	// then the zone's own added stories over its outline. Only the zone's own floors are reuse;
	// the rest is new construction, drawn orange with the zone's green edges.

	interface Props {
		zone: ReuseZone;
		part: Part;
		structure: Structure;
		is3D: boolean;
	}

	let { zone, part, structure, is3D }: Props = $props();

	const PLAN_Y = 0.11; // just above the part slab (0.1)
	const PROUD = 0.04; // m the 3D slice stands out from the building's surfaces
	const EDGE = '#2f7a5c';

	let outline = $derived(zoneOutline(zone, part));
	const toShape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
	let shape = $derived(toShape(outline));
	let proudShape = $derived(toShape(offsetPolygon(outline, PROUD)));

	// Floors from-to as a slab. Floor 1 starts at ground level; floor 0 is the basement, below it.
	// A slab reaching the roof covers it too, so it rises just above it.
	function slab(from: number, to: number, roofTop: number): THREE.BufferGeometry {
		const fh = structure.floorHeight;
		const top = to * fh + (to >= roofTop ? PROUD : 0);
		const g = new THREE.ExtrudeGeometry(proudShape, { depth: top - (from - 1) * fh, bevelEnabled: false });
		g.rotateX(Math.PI / 2); // shape y -> site y (+Z); extrusion runs down
		g.translate(0, top, 0);
		return g;
	}

	let slabs = $derived.by(() => {
		const [from, to] = zone.floors;
		const own = structure.stories, stack = totalStories(structure), added = zone.addedStories ?? 0;
		const roofTop = stack + added;
		const out: { geo: THREE.BufferGeometry; color: string }[] = [];
		if (from <= own) out.push({ geo: slab(from, Math.min(to, own), roofTop), color: COLORS.reuse });
		if (to > own) out.push({ geo: slab(Math.max(from, own + 1), to, roofTop), color: COLORS.new });
		if (added) out.push({ geo: slab(stack + 1, stack + added, roofTop), color: COLORS.new });
		return out.map((s) => ({ ...s, edges: new THREE.EdgesGeometry(s.geo) }));
	});

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
	{#each slabs as s, i (i)}
		<T.Mesh geometry={s.geo} castShadow>
			<T.MeshLambertMaterial color={s.color} />
		</T.Mesh>
		<T.LineSegments geometry={s.edges}>
			<T.LineBasicMaterial color={EDGE} />
		</T.LineSegments>
	{/each}
{:else}
	<T.Mesh geometry={flat} position={[0, PLAN_Y, 0]}>
		<T.MeshBasicMaterial color={COLORS.reuse} transparent opacity={upstairs ? 0.45 : 0.85} side={THREE.DoubleSide} depthWrite={false} />
	</T.Mesh>
	<!-- Keyed, so its material is never swapped in place (see the foam in ContextLayer) -->
	{#key upstairs}
	<T.Line bind:ref={dashRef} geometry={flatEdges}>
		{#if upstairs}
			<T.LineDashedMaterial color={EDGE} dashSize={0.6} gapSize={0.4} />
		{:else}
			<T.LineBasicMaterial color={EDGE} />
		{/if}
	</T.Line>
	{/key}
{/if}
