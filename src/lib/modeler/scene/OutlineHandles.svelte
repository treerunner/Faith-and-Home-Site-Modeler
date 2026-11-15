<script lang="ts">
	import { T } from '@threlte/core';
	import type { Part } from '../types';
	import { COLORS } from '../colors';
	import { partOutline } from '../geo';

	// Point handles for an outline in plan view: one at every point to drag it, and a smaller one
	// at each edge's midpoint that drags out a new point. Double-click a point to remove it; hold
	// Alt to drag without snapping.

	interface Props {
		part: Part;
	}

	let { part }: Props = $props();

	const Y = 0.32; // above the resize handles' level
	const SIZE = 1.4; // a little smaller than the resize handles (2 m)

	let points = $derived(partOutline(part));
	let mids = $derived(
		points.map((a, i) => {
			const b = points[(i + 1) % points.length];
			return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number];
		}),
	);
</script>

{#each points as [x, y], i (i)}
	<T.Mesh position={[x, Y, y]} userData={{ vertexPartId: part.id, vertexIndex: i }}>
		<T.BoxGeometry args={[SIZE, SIZE, SIZE]} />
		<T.MeshLambertMaterial color={COLORS.selection} />
	</T.Mesh>
{/each}
{#each mids as [x, y], i (i)}
	<T.Mesh position={[x, Y, y]} userData={{ vertexPartId: part.id, insertAfter: i }}>
		<T.CylinderGeometry args={[SIZE / 3, SIZE / 3, SIZE / 2, 12]} />
		<T.MeshLambertMaterial color="#ffffff" />
	</T.Mesh>
{/each}
