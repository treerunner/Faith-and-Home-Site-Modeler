<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { applyGrain, GRAIN_BUILDING } from './grain';
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

	// Shape outline in part-local meters; shape y becomes site y (+Z) after rotateX below
	function outline(p: Part): [number, number][] | null {
		if (p.shape === 'tri') return [[-p.w / 2, p.d / 2], [p.w / 2, p.d / 2], [0, -p.d / 2]];
		if (p.shape === 'poly' && p.points) return p.points.map(([u, v]) => [u * p.w, v * p.d]);
		return null;
	}

	function makeGeo(p: Part, h: number, floors: number) {
		const { w, d } = p;
		if (p.shape === 'circle') {
			return new THREE.CylinderGeometry(w / 2, w / 2, h, 32, floors);
		}
		const pts = outline(p);
		if (pts) {
			const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
			const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
			geo.rotateX(Math.PI / 2);
			geo.translate(0, h / 2, 0); // center on Y=0 to match BoxGeometry (extrusion is in -Y after rotateX)
			return geo;
		}
		return new THREE.BoxGeometry(w, h, d, 1, floors, 1);
	}

	let is3D = $derived(height !== undefined);
	let actualH = $derived(is3D ? (height as number) : SLAB_HEIGHT);
	let actualFloors = $derived(is3D ? stories : 1);
	let posY = $derived(is3D ? (height as number) / 2 : SLAB_HEIGHT / 2);

	let geo = $derived(makeGeo(part, actualH, actualFloors));
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
		oncreate={(m) => applyGrain(m, GRAIN_BUILDING)}
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
