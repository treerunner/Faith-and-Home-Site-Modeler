<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { COLORS, FH } from '../colors';
	import type { Contour, TerrainModel } from '../terrain';
	import { bandsGeometry } from './drape';

	// Ground as stacked board layers, one per contour interval, cut from the same off-white
	// board as the base. Plan view prints the contours instead, so editing stays flat.

	interface Props {
		model: TerrainModel;
		is3D: boolean;
	}

	let { model, is3D }: Props = $props();

	const LAYER_EDGE = '#cfcac0'; // as the foam edges
	const PLAN_Y = 0.001; // printed on the board, under roads
	const INDEX_LINE = '#6f6b6c'; // every fifth contour, darker than the rest

	// The side of each layer: a wall from the layer below up to its top
	function wallsGeometry(walls: Contour[], interval: number): THREE.BufferGeometry {
		const out: number[] = [];
		for (const { y, a, b } of walls) {
			const lo = y - interval;
			out.push(a[0], lo, a[1], b[0], lo, b[1], b[0], y, b[1]);
			out.push(a[0], lo, a[1], b[0], y, b[1], a[0], y, a[1]);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
		g.computeVertexNormals();
		return g;
	}

	function linesGeometry(lines: Contour[], y?: number): THREE.BufferGeometry {
		return new THREE.BufferGeometry().setFromPoints(
			lines.flatMap((c) => [new THREE.Vector3(c.a[0], y ?? c.y, c.a[1]), new THREE.Vector3(c.b[0], y ?? c.y, c.b[1])]),
		);
	}

	let tops = $derived(is3D ? bandsGeometry(model.bands) : null);
	let walls = $derived(is3D ? wallsGeometry([...model.contours, ...model.edges], model.interval) : null);
	let edgeLines = $derived(is3D ? linesGeometry([...model.contours, ...model.edges]) : null);
	let planLines = $derived(is3D ? null : linesGeometry(model.contours.filter((c) => !c.index), PLAN_Y));
	let planIndexLines = $derived(is3D ? null : linesGeometry(model.contours.filter((c) => c.index), PLAN_Y));
</script>

{#if tops && walls && edgeLines}
	<T.Mesh geometry={tops} receiveShadow>
		<T.MeshLambertMaterial color={COLORS.base} emissive={COLORS.base} emissiveIntensity={0.4} toneMapped={false} />
	</T.Mesh>
	<T.Mesh geometry={walls} castShadow receiveShadow>
		<T.MeshLambertMaterial color={COLORS.base} emissive={COLORS.base} emissiveIntensity={0.4} toneMapped={false} side={THREE.DoubleSide} />
	</T.Mesh>
	<T.LineSegments geometry={edgeLines}>
		<T.LineBasicMaterial color={LAYER_EDGE} />
	</T.LineSegments>
{/if}

{#if planLines && planIndexLines}
	<T.LineSegments geometry={planLines}>
		<T.LineBasicMaterial color={FH.stone} />
	</T.LineSegments>
	<T.LineSegments geometry={planIndexLines}>
		<T.LineBasicMaterial color={INDEX_LINE} />
	</T.LineSegments>
{/if}
