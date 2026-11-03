<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Part } from '../types';
	import { COLORS } from '../colors';

	interface Props {
		part: Part;
		selected: boolean;
		ghost?: boolean;
	}

	let { part, selected, ghost = false }: Props = $props();

	const SLAB_HEIGHT = 0.1;

	function makeGeometry(shape: Part['shape'], w: number, d: number): THREE.BufferGeometry {
		if (shape === 'tri') {
			const s = new THREE.Shape();
			s.moveTo(-w / 2, -d / 2);
			s.lineTo(w / 2, -d / 2);
			s.lineTo(0, d / 2);
			s.closePath();
			const geo = new THREE.ExtrudeGeometry(s, { depth: SLAB_HEIGHT, bevelEnabled: false });
			geo.rotateX(-Math.PI / 2);
			return geo;
		}
		return new THREE.BoxGeometry(w, SLAB_HEIGHT, d);
	}

	let geo = $derived(makeGeometry(part.shape, part.w, part.d));

	const baseColor = COLORS.existing;
	let color = $derived(selected ? COLORS.selection : baseColor);
	let opacity = $derived(ghost ? 0.45 : 1);
</script>

<T.Mesh
	geometry={geo}
	position={[part.x, SLAB_HEIGHT / 2, part.y]}
	rotation={[0, -(part.rotation * Math.PI) / 180, 0]}
	userData={{ partId: part.id }}
>
	<T.MeshLambertMaterial
		{color}
		{opacity}
		transparent={ghost || opacity < 1}
		side={THREE.FrontSide}
	/>
</T.Mesh>
