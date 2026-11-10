<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import PlanCamera from './PlanCamera.svelte';
	import PerspCamera from './PerspCamera.svelte';
	import PartMesh from './PartMesh.svelte';
	import RoofMesh from './RoofMesh.svelte';
	import ResizeHandles from './ResizeHandles.svelte';
	import OpenSpacePolygon from './OpenSpacePolygon.svelte';
	import { store } from '../store.svelte';
	import { COLORS } from '../colors';
	import { setMainScene } from './cameraRef';
	import type { Status, Structure } from '../types';

	const { scene } = useThrelte();

	$effect(() => {
		setMainScene(scene);
	});

	// Per-part lookup maps derived from structures
	let partStatusMap = $derived<Map<string, Status>>(
		new Map(
			store.site.structures.flatMap((s) => s.parts.map((p) => [p.id, s.status] as [string, Status])),
		),
	);

	let partHeightMap = $derived<Map<string, number>>(
		new Map(
			store.site.structures.flatMap((s) =>
				s.parts.map((p) => [p.id, s.stories * s.floorHeight] as [string, number]),
			),
		),
	);

	let partStructureMap = $derived<Map<string, Structure>>(
		new Map(
			store.site.structures.flatMap((s) => s.parts.map((p) => [p.id, s] as [string, Structure])),
		),
	);

	let allParts = $derived(store.site.structures.flatMap((s) => s.parts));

	let ghostPart = $derived(
		store.mode.type === 'placing'
			? ({
					id: '__ghost__',
					shape: store.mode.shape,
					x: store.mode.ghostX,
					y: store.mode.ghostY,
					w: store.mode.shape === 'rect' ? 10 : 6,
					d: 6,
					rotation: 0,
				} as const)
			: null,
	);

	const CLOSE_DIST = 4;

	let drawingMode = $derived(store.mode.type === 'drawingOpenSpace' ? store.mode : null);

	let draftOpenSpace = $derived(
		drawingMode && drawingMode.points.length > 0
			? {
					id: '__draft__',
					kind: drawingMode.kind,
					polygon: (() => {
						const { points, cursorPoint } = drawingMode;
						if (!cursorPoint) return points;
						const snapToClose =
							points.length >= 3 &&
							Math.hypot(cursorPoint[0] - points[0][0], cursorPoint[1] - points[0][1]) < CLOSE_DIST;
						return [...points, snapToClose ? points[0] : cursorPoint] as [number, number][];
					})(),
				}
			: null,
	);

	let nearClose = $derived(
		drawingMode !== null &&
		drawingMode.points.length >= 3 &&
		drawingMode.cursorPoint !== undefined &&
		Math.hypot(
			drawingMode.cursorPoint[0] - drawingMode.points[0][0],
			drawingMode.cursorPoint[1] - drawingMode.points[0][1],
		) < CLOSE_DIST,
	);

	// Lighting varies between plan and 3D view
	// 3D: NW sun position so shadows fall toward SE, giving clear depth from the default camera angle
	let lightPos = $derived<[number, number, number]>(
		store.viewMode === '3d' ? [-40, 80, -40] : [10, 20, 10],
	);
	let lightIntensity = $derived(store.viewMode === '3d' ? 1.8 : 1.2);
	let ambientIntensity = $derived(store.viewMode === '3d' ? 0.47 : 0.6);

	// Shadow camera config — covers any reasonably-sized site
	let dirLight: THREE.DirectionalLight | undefined = $state();
	$effect(() => {
		if (!dirLight) return;
		dirLight.shadow.mapSize.set(2048, 2048);
		const cam = dirLight.shadow.camera as THREE.OrthographicCamera;
		cam.left = -120; cam.right = 120;
		cam.top = 120;   cam.bottom = -120;
		cam.near = 1;    cam.far = 400;
		cam.updateProjectionMatrix();
		dirLight.shadow.bias = -0.0005;
	});

	// Pedestal: AABB of all parts + margin, 4 m deep
	const PAD = 20, MIN_SIDE = 30, DEPTH = 4;
	let pedestal = $derived.by(() => {
		const parts = store.site.structures.flatMap((s) => s.parts);
		if (parts.length === 0) return { cx: 0, cz: 0, w: MIN_SIDE, d: MIN_SIDE };
		const xs = parts.flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2]);
		const zs = parts.flatMap((p) => [p.y - p.d / 2, p.y + p.d / 2]);
		const minX = Math.min(...xs) - PAD, maxX = Math.max(...xs) + PAD;
		const minZ = Math.min(...zs) - PAD, maxZ = Math.max(...zs) + PAD;
		return {
			cx: (minX + maxX) / 2,
			cz: (minZ + maxZ) / 2,
			w: Math.max(MIN_SIDE, maxX - minX),
			d: Math.max(MIN_SIDE, maxZ - minZ),
		};
	});
</script>

<PlanCamera />
<PerspCamera />

<T.DirectionalLight
	bind:ref={dirLight}
	position={lightPos}
	intensity={lightIntensity}
	color="#fff8f0"
	castShadow
/>
<T.AmbientLight intensity={ambientIntensity} color="#f5f0e8" />

{#if store.viewMode === 'plan'}
	<T.GridHelper args={[120, 120, COLORS.grid, COLORS.gridSub]} position={[0, 0, 0]} />
{/if}

{#if store.viewMode === '3d'}
	<!-- Pedestal base -->
	<T.Mesh position={[pedestal.cx, -DEPTH / 2, pedestal.cz]} receiveShadow>
		<T.BoxGeometry args={[pedestal.w, DEPTH, pedestal.d]} />
		<T.MeshLambertMaterial color="#c8b898" />
	</T.Mesh>
{/if}

{#each store.site.openSpaces as os (os.id)}
	<OpenSpacePolygon openSpace={os} selected={store.selectedOpenSpaceId === os.id} />
{/each}

{#if draftOpenSpace}
	<OpenSpacePolygon openSpace={draftOpenSpace} draft />
{/if}

<!-- Vertex markers while drawing an open space -->
{#if drawingMode}
	{#each drawingMode.points as pt, i (i)}
		{@const isFirst = i === 0}
		{@const markerColor = isFirst && nearClose ? '#22c55e' : isFirst ? '#f59e0b' : '#6b7280'}
		<T.Mesh position={[pt[0], 0.3, pt[1]]}>
			<T.CylinderGeometry args={[isFirst ? 1.2 : 0.7, isFirst ? 1.2 : 0.7, 0.4, 16]} />
			<T.MeshLambertMaterial color={markerColor} />
		</T.Mesh>
	{/each}
{/if}

{#each allParts as part (part.id)}
	{@const struct = partStructureMap.get(part.id)}
	<PartMesh
		{part}
		selected={store.selectedPartId === part.id}
		status={partStatusMap.get(part.id) ?? 'existing'}
		cloning={store.mode.type === 'dragging' && store.mode.cloning === true && store.mode.companions.some((c) => c.id === part.id)}
		height={store.viewMode === '3d' ? (partHeightMap.get(part.id) ?? 3.5) : undefined}
		stories={struct?.stories ?? 1}
	/>
	{#if store.viewMode === '3d' && struct && struct.roof !== 'flat'}
		<RoofMesh
			{part}
			roof={struct.roof}
			status={struct.status}
			totalHeight={partHeightMap.get(part.id) ?? 3.5}
		/>
	{/if}
{/each}

{#if ghostPart}
	<PartMesh part={ghostPart} selected={false} ghost />
{/if}

{#if store.selectedPart && store.viewMode === 'plan'}
	<ResizeHandles part={store.selectedPart} />
{/if}
