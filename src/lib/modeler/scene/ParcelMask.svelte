<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { COLORS } from '../colors';
	import { CONTEXT_HALF_SIZE } from '../geo';

	// Dims the board outside the chosen parcel so the property reads as the focus:
	// a translucent sheet over the whole board with the parcel cut out.

	interface Props {
		parcel: [number, number][];
		is3D: boolean;
	}

	let { parcel, is3D }: Props = $props();

	const OPACITY = 0.22;
	// Plan: just above the foam footprint slabs (0.05), below parts (0.1).
	// 3D: on the board, ordered by polygonOffset above roads (-1) and below open spaces (-2).
	const PLAN_Y = 0.06;

	let geo = $derived.by(() => {
		const h = CONTEXT_HALF_SIZE;
		const sheet = new THREE.Shape([
			new THREE.Vector2(-h, -h),
			new THREE.Vector2(h, -h),
			new THREE.Vector2(h, h),
			new THREE.Vector2(-h, h),
		]);
		sheet.holes.push(new THREE.Path(parcel.map(([x, y]) => new THREE.Vector2(x, y))));
		const g = new THREE.ShapeGeometry(sheet);
		g.rotateX(Math.PI / 2); // shape y -> site y (+Z)
		return g;
	});
</script>

<T.Mesh geometry={geo} position={[0, is3D ? 0.002 : PLAN_Y, 0]} renderOrder={1}>
	<T.MeshBasicMaterial
		color={COLORS.existing}
		transparent
		opacity={OPACITY}
		toneMapped={false}
		depthWrite={false}
		side={THREE.DoubleSide}
		polygonOffset
		polygonOffsetFactor={-1.5}
		polygonOffsetUnits={-1.5}
	/>
</T.Mesh>
