<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { COLORS, FH } from '../colors';
	import type { Contour, TerrainSurface, TerrainModel } from '../terrain';

	// Ground as a milled site model: in 3D, a smooth surface in the board's off-white with
	// contours etched on it and buildings on graded pads. Plan view prints the natural contours,
	// so editing stays flat.

	interface Props {
		model: TerrainModel;
		surface: TerrainSurface | null; // in 3D
	}

	let { model, surface }: Props = $props();

	const PLAN_Y = 0.001; // printed on the board, under roads
	const ETCH_LIFT = 0.03; // etched lines just above the surface
	const ETCH = '#d6d1c7';
	const ETCH_INDEX = '#bdb7ab';
	const INDEX_LINE = '#6f6b6c'; // plan view: every fifth contour, darker than the rest

	function linesGeometry(lines: Contour[], y: (h: number) => number): THREE.BufferGeometry {
		return new THREE.BufferGeometry().setFromPoints(
			lines.flatMap((c) => [new THREE.Vector3(c.a[0], y(c.a[2]), c.a[1]), new THREE.Vector3(c.b[0], y(c.b[2]), c.b[1])]),
		);
	}

	function surfaceGeometry(s: TerrainSurface): THREE.BufferGeometry {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
		g.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
		return g;
	}

	// The board's sides: from the surface's edge down to the base board under its lowest point
	function sideGeometry(s: TerrainSurface): THREE.BufferGeometry {
		const out: number[] = [];
		const lo = s.minY - 0.01;
		for (let i = 0; i < s.edge.length; i++) {
			const [ax, ay, ah] = s.edge[i], [bx, by, bh] = s.edge[(i + 1) % s.edge.length];
			out.push(ax, lo, ay, bx, lo, by, bx, bh, by, ax, lo, ay, bx, bh, by, ax, ah, ay);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
		g.computeVertexNormals();
		return g;
	}

	let ground = $derived(surface ? surfaceGeometry(surface) : null);
	let sides = $derived(surface ? sideGeometry(surface) : null);
	let etched = $derived(surface ? linesGeometry(surface.contours.filter((c) => !c.index), (h) => h + ETCH_LIFT) : null);
	let etchedIndex = $derived(surface ? linesGeometry(surface.contours.filter((c) => c.index), (h) => h + ETCH_LIFT) : null);
	let planLines = $derived(surface ? null : linesGeometry(model.contours.filter((c) => !c.index), () => PLAN_Y));
	let planIndexLines = $derived(surface ? null : linesGeometry(model.contours.filter((c) => c.index), () => PLAN_Y));
</script>

{#if ground && sides && etched && etchedIndex}
	<!-- Less emissive than the flat board, so slopes shade -->
	<T.Mesh geometry={ground} castShadow receiveShadow>
		<T.MeshLambertMaterial color={COLORS.base} emissive={COLORS.base} emissiveIntensity={0.2} toneMapped={false} />
	</T.Mesh>
	<!-- From below (a low camera over a hill) the ground reads as cut solid board, not a shell -->
	<T.Mesh geometry={ground}>
		<T.MeshBasicMaterial color={COLORS.cut} toneMapped={false} side={THREE.BackSide} />
	</T.Mesh>
	<T.Mesh geometry={sides} receiveShadow>
		<T.MeshLambertMaterial color={COLORS.base} emissive={COLORS.base} emissiveIntensity={0.2} toneMapped={false} side={THREE.DoubleSide} />
	</T.Mesh>
	<T.LineSegments geometry={etched}>
		<T.LineBasicMaterial color={ETCH} />
	</T.LineSegments>
	<T.LineSegments geometry={etchedIndex}>
		<T.LineBasicMaterial color={ETCH_INDEX} />
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
