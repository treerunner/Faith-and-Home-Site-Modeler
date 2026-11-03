<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Part } from '../types';
	import type { ResizeHandle } from '../interaction';
	import { COLORS } from '../colors';
	import { store } from '../store.svelte';

	interface Props {
		part: Part;
	}

	let { part }: Props = $props();

	const SIZE = 0.6; // handle cube side in meters
	const Y = 0.3; // height above grid

	interface Handle {
		id: ResizeHandle;
		x: number;
		y: number;
	}

	let handles = $derived<Handle[]>([
		{ id: 'nw', x: part.x - part.w / 2, y: part.y + part.d / 2 },
		{ id: 'ne', x: part.x + part.w / 2, y: part.y + part.d / 2 },
		{ id: 'se', x: part.x + part.w / 2, y: part.y - part.d / 2 },
		{ id: 'sw', x: part.x - part.w / 2, y: part.y - part.d / 2 },
	]);

	// Rotation handle: circle mesh above the part's north edge center
	let rotHandleX = $derived(part.x);
	let rotHandleY = $derived(part.y + part.d / 2 + 1.5);

	type ThreltePointerEvent = { intersection?: { point: THREE.Vector3 }; nativeEvent?: Event };

	function handleResizeDown(h: ResizeHandle, e: ThreltePointerEvent) {
		e.nativeEvent?.stopPropagation?.();
		store.startResizing(part.id, h);
	}

	function handleRotateDown(e: { intersection?: { point: THREE.Vector3 }; nativeEvent?: Event }) {
		e.nativeEvent?.stopPropagation?.();
		const pt = e.intersection?.point;
		if (pt) {
			store.startRotating(part.id, pt.x, pt.z);
		}
	}
</script>

{#each handles as h (h.id)}
	<T.Mesh
		position={[h.x, Y, h.y]}
		onpointerdown={(e: ThreltePointerEvent) => handleResizeDown(h.id, e)}
	>
		<T.BoxGeometry args={[SIZE, SIZE, SIZE]} />
		<T.MeshLambertMaterial color={COLORS.selection} />
	</T.Mesh>
{/each}

<!-- Rotation handle -->
<T.Mesh
	position={[rotHandleX, Y, rotHandleY]}
	onpointerdown={handleRotateDown}
>
	<T.CylinderGeometry args={[SIZE / 2, SIZE / 2, SIZE, 16]} />
	<T.MeshLambertMaterial color="#7c3aed" />
</T.Mesh>
