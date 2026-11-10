<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Part, Status } from '../types';
	import { COLORS, statusColor } from '../colors';

	interface Props {
		part: Part;
		selected: boolean;
		ghost?: boolean;
		cloning?: boolean;
		status?: Status;
		height?: number;   // undefined = plan slab; number = 3D extrusion
		stories?: number;  // used for floor subdivision lines in 3D
	}

	let {
		part,
		selected,
		ghost = false,
		cloning = false,
		status = 'existing',
		height,
		stories = 1,
	}: Props = $props();

	const SLAB_HEIGHT = 0.1;
	const EDGE_COLOR = '#4a3f30';

	function makeGeo(shape: Part['shape'], w: number, d: number, h: number, floors: number) {
		if (shape === 'tri') {
			const s = new THREE.Shape();
			s.moveTo(-w / 2, -d / 2);
			s.lineTo(w / 2, -d / 2);
			s.lineTo(0, d / 2);
			s.closePath();
			const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
			geo.rotateX(Math.PI / 2);
			return geo;
		}
		return new THREE.BoxGeometry(w, h, d, 1, floors, 1);
	}

	let is3D = $derived(height !== undefined);
	let actualH = $derived(is3D ? (height as number) : SLAB_HEIGHT);
	let actualFloors = $derived(is3D ? stories : 1);
	let posY = $derived(is3D ? (height as number) / 2 : SLAB_HEIGHT / 2);

	let geo = $derived(makeGeo(part.shape, part.w, part.d, actualH, actualFloors));
	let edgeGeo = $derived(is3D ? new THREE.EdgesGeometry(geo) : null);

	let isRemoved = $derived(status === 'removed');
	let baseColor = $derived(statusColor(status));
	let faceColor = $derived(selected ? COLORS.selection : baseColor);

	let dashedLineRef: THREE.LineSegments | undefined = $state();
	$effect(() => {
		if (dashedLineRef) dashedLineRef.computeLineDistances();
	});

	// In plan mode: same as before. In 3D: face hidden for removed, dashed outline
	let faceOpacity = $derived(
		ghost || cloning ? 0.45
		: is3D && isRemoved ? 0
		: !is3D && isRemoved ? 0.35
		: 1,
	);
	let faceTransparent = $derived(ghost || faceOpacity < 1);
</script>

<!-- Face mesh (hidden for removed in 3D) -->
<T.Mesh
	geometry={geo}
	position={[part.x, posY, part.y]}
	rotation={[0, -(part.rotation * Math.PI) / 180, 0]}
	userData={{ partId: part.id }}
	castShadow
	receiveShadow
>
	<T.MeshLambertMaterial
		color={faceColor}
		opacity={faceOpacity}
		transparent={faceTransparent}
		polygonOffset={is3D}
		polygonOffsetFactor={1}
		polygonOffsetUnits={1}
		side={THREE.FrontSide}
	/>
</T.Mesh>

<!-- Floor-line edges (3D only) -->
{#if is3D && edgeGeo}
	{#if isRemoved}
		<!-- Dashed outline for removed -->
		<T.LineSegments
			bind:ref={dashedLineRef}
			geometry={edgeGeo}
			position={[part.x, posY, part.y]}
			rotation={[0, -(part.rotation * Math.PI) / 180, 0]}
		>
			<T.LineDashedMaterial color="#888888" dashSize={0.5} gapSize={0.3} />
		</T.LineSegments>
	{:else}
		<T.LineSegments
			geometry={edgeGeo}
			position={[part.x, posY, part.y]}
			rotation={[0, -(part.rotation * Math.PI) / 180, 0]}
		>
			<T.LineBasicMaterial color={EDGE_COLOR} />
		</T.LineSegments>
	{/if}
{/if}
