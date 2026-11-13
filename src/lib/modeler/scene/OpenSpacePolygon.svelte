<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { OpenSpace } from '../types';
	import { OPEN_SPACE_COLORS } from '../colors';
	import { store } from '../store.svelte';
	import { drapeGeometry } from './drape';

	interface Props {
		openSpace: OpenSpace;
		draft?: boolean;
		selected?: boolean;
	}

	let { openSpace, draft = false, selected = false }: Props = $props();

	const Y_FILL = 0.01;   // above grid, below parts
	const Y_HANDLE = 0.3;
	const HANDLE_R = 0.9;

	function makeGeo(polygon: [number, number][]): THREE.ShapeGeometry | null {
		if (polygon.length < 3) return null;
		const shape = new THREE.Shape();
		shape.moveTo(polygon[0][0], polygon[0][1]);
		for (let i = 1; i < polygon.length; i++) {
			shape.lineTo(polygon[i][0], polygon[i][1]);
		}
		shape.closePath();
		const geo = new THREE.ShapeGeometry(shape);
		// ShapeGeometry lives in XY; rotate so site-y maps to THREE.js +z
		geo.rotateX(Math.PI / 2);
		return geo;
	}

	let flatGeo = $derived(makeGeo(openSpace.polygon));
	// In 3D on terrain, laid onto the layers
	let geo = $derived(flatGeo && store.terrain3D ? drapeGeometry(flatGeo, store.terrain3D) : flatGeo);
	let color = $derived(OPEN_SPACE_COLORS[openSpace.kind]);
	let opacity = $derived(draft ? 0.3 : selected ? 0.75 : 0.55);
</script>

{#if geo}
	<!-- Visible fill — polygonOffset pulls depth toward camera to beat the pedestal -->
	<T.Mesh position={[0, Y_FILL, 0]} geometry={geo}>
		<T.MeshLambertMaterial {color} {opacity} transparent side={THREE.DoubleSide}
			polygonOffset={true} polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
	</T.Mesh>
	<!-- Hit-test mesh (transparent but physically present) -->
	{#if !draft}
		<T.Mesh position={[0, Y_FILL + 0.005, 0]} geometry={geo} userData={{ openSpaceId: openSpace.id }}>
			<T.MeshBasicMaterial opacity={0} transparent side={THREE.DoubleSide} />
		</T.Mesh>
	{/if}
{/if}

<!-- Vertex handles when selected -->
{#if selected}
	{#each openSpace.polygon as pt, i (i)}
		<T.Mesh
			position={[pt[0], Y_HANDLE, pt[1]]}
			userData={{ openSpaceId: openSpace.id, osVertex: i }}
		>
			<T.CylinderGeometry args={[HANDLE_R, HANDLE_R, 0.5, 16]} />
			<T.MeshLambertMaterial color="#2563eb" />
		</T.Mesh>
	{/each}
{/if}
