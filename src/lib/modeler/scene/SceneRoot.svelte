<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import PlanCamera from './PlanCamera.svelte';
	import PerspCamera from './PerspCamera.svelte';
	import PartMesh from './PartMesh.svelte';
	import RoofMesh from './RoofMesh.svelte';
	import ResizeHandles from './ResizeHandles.svelte';
	import OpenSpacePolygon from './OpenSpacePolygon.svelte';
	import TreeMesh from './TreeMesh.svelte';
	import ContextLayer from './ContextLayer.svelte';
	import ParcelLine from './ParcelLine.svelte';
	import ParcelMask from './ParcelMask.svelte';
	import ReuseZoneMesh from './ReuseZoneMesh.svelte';
	import TerrainSurface from './TerrainSurface.svelte';
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
			store.plan.structures.flatMap((s) => s.parts.map((p) => [p.id, s.status] as [string, Status])),
		),
	);

	let partHeightMap = $derived<Map<string, number>>(
		new Map(
			store.plan.structures.flatMap((s) =>
				s.parts.map((p) => [p.id, s.stories * s.floorHeight] as [string, number]),
			),
		),
	);

	let partStructureMap = $derived<Map<string, Structure>>(
		new Map(
			store.plan.structures.flatMap((s) => s.parts.map((p) => [p.id, s] as [string, Structure])),
		),
	);

	let allParts = $derived(store.plan.structures.flatMap((s) => s.parts));

	// In 3D on terrain, each structure stands on its graded pad, at the lowest ground under any
	// of its pieces, so a building never floats and its pieces stay level. Derived, never saved.
	let structureBase = $derived.by(() => {
		const bases = new Map<string, number>();
		const ground = store.ground;
		if (ground) store.plan.structures.forEach((s, i) => bases.set(s.id, ground.bases[i]));
		return bases;
	});
	const baseFor = (s: Structure | undefined) => (s ? (structureBase.get(s.id) ?? 0) : 0);

	// Cutting: the building being cut is highlighted, with a dashed line from the first click
	let cutting = $derived(store.mode.type === 'cutting' ? store.mode : null);
	let cutPartIds = $derived(
		new Set(cutting ? (store.plan.structures.find((s) => s.id === cutting.structureId)?.parts.map((p) => p.id) ?? []) : []),
	);
	let cutLine = $derived.by(() => {
		if (!cutting?.start || !cutting.cursor) return null;
		return new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(cutting.start[0], 0.3, cutting.start[1]),
			new THREE.Vector3(cutting.cursor[0], 0.3, cutting.cursor[1]),
		]);
	});
	let cutLineRef: THREE.Line | undefined = $state();
	$effect(() => {
		if (cutLineRef && cutLine) cutLineRef.computeLineDistances();
	});

	let ghostPart = $derived(
		store.mode.type === 'placing'
			? ({
					id: '__ghost__',
					shape: store.mode.shape,
					x: store.mode.ghostX,
					y: store.mode.ghostY,
					w: 6,
					d: 6,
					rotation: 0,
				} as const)
			: null,
	);

	const CLOSE_DIST = 4;

	// Open spaces, parcels and reuse zones are traced point by point and share the vertex markers
	let drawingMode = $derived(
		store.mode.type === 'drawingOpenSpace' || store.mode.type === 'drawingParcel' || store.mode.type === 'drawingZone'
			? store.mode
			: null,
	);

	let zoneDraft = $derived(
		store.mode.type === 'drawingZone'
			? store.mode.cursorPoint
				? [...store.mode.points, store.mode.cursorPoint]
				: store.mode.points
			: null,
	);

	let parcelDraft = $derived(
		store.mode.type === 'drawingParcel'
			? store.mode.cursorPoint
				? [...store.mode.points, store.mode.cursorPoint]
				: store.mode.points
			: null,
	);

	let draftOpenSpace = $derived(
		drawingMode && drawingMode.type === 'drawingOpenSpace' && drawingMode.points.length > 0
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

	let isAddress = $derived(store.site.mode === 'address');

	// Shadow camera config — covers any reasonably-sized site, or the whole context board
	let dirLight: THREE.DirectionalLight | undefined = $state();
	$effect(() => {
		if (!dirLight) return;
		const extent = isAddress ? store.boardHalf + 10 : 120;
		dirLight.shadow.mapSize.set(isAddress ? 4096 : 2048, isAddress ? 4096 : 2048);
		const cam = dirLight.shadow.camera as THREE.OrthographicCamera;
		cam.left = -extent; cam.right = extent;
		cam.top = extent;   cam.bottom = -extent;
		cam.near = 1;    cam.far = 400;
		cam.updateProjectionMatrix();
		dirLight.shadow.bias = -0.0005;
	});

	// Pedestal: AABB of all parts + margin, 4 m deep. In address mode, the whole context board.
	const PAD = 20, MIN_SIDE = 30, DEPTH = 4;
	let pedestal = $derived.by(() => {
		if (isAddress) return { cx: 0, cz: 0, w: store.boardHalf * 2, d: store.boardHalf * 2 };
		const parts = store.plan.structures.flatMap((s) => s.parts);
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
	<!-- Grid mode covers the whole ground plane so panning never reaches its edge -->
	{@const gridSize = store.boardHalf * 2}
	<T.GridHelper args={[gridSize, gridSize, COLORS.grid, COLORS.gridSub]} position={[0, 0, 0]} />
{/if}

{#if store.viewMode === '3d'}
	<!-- Pedestal base -->
	<!-- On terrain, the board sits under the lowest layer -->
	{@const boardTop = store.ground ? store.ground.minY - 0.01 : 0}
	<T.Mesh position={[pedestal.cx, boardTop - DEPTH / 2, pedestal.cz]} receiveShadow>
		<T.BoxGeometry args={[pedestal.w, DEPTH, pedestal.d]} />
		<!-- Address mode: an off-white printed board; grid mode keeps the kraft base -->
		{#if isAddress}
			<T.MeshLambertMaterial color={COLORS.base} emissive={COLORS.base} emissiveIntensity={0.4} toneMapped={false} />
		{:else}
			<T.MeshLambertMaterial color="#c8b898" />
		{/if}
	</T.Mesh>
{/if}

{#if store.terrain}
	<TerrainSurface model={store.terrain} surface={store.ground} />
{/if}

<ContextLayer context={store.site.context} half={store.boardHalf} is3D={store.viewMode === '3d'} terrain={store.ground ? store.terrain : null} surface={store.ground} />

{#if store.site.parcel && store.site.parcel.length >= 3}
	<ParcelLine polygon={store.site.parcel} />
	{#if isAddress && store.mode.type !== 'choosingParcel'}
		<ParcelMask parcel={store.site.parcel} half={store.boardHalf} is3D={store.viewMode === '3d'} surface={store.ground} />
	{/if}
{/if}

<!-- Choosing parcels: selected ones tinted, the one under the cursor outlined, others dashed -->
{#if store.mode.type === 'choosingParcel' && store.setup}
	{@const hoverId = store.mode.hoverId}
	{@const selected = store.setup.selected}
	{#each store.setup.context.parcels as parcel (parcel.id)}
		{@const isSelected = selected.includes(parcel.id)}
		<ParcelLine
			polygon={parcel.polygon}
			dashed={!isSelected && parcel.id !== hoverId}
			highlight={isSelected || parcel.id === hoverId}
			fill={isSelected}
		/>
	{/each}
{/if}

<!-- Drawing a parcel: the outline so far, closing to the cursor -->
{#if parcelDraft && parcelDraft.length >= 2}
	<ParcelLine polygon={parcelDraft} highlight fill />
{/if}

{#each store.plan.openSpaces as os (os.id)}
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
	<T.Group position.y={baseFor(struct)}>
		<PartMesh
			{part}
			selected={store.selectedPartId === part.id || cutPartIds.has(part.id)}
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
	</T.Group>
{/each}

{#if cutLine}
	<T.Line bind:ref={cutLineRef} geometry={cutLine}>
		<T.LineDashedMaterial color={COLORS.parcel} dashSize={1} gapSize={0.6} />
	</T.Line>
{/if}

{#each store.plan.structures as s (s.id)}
	{#each s.reuseZones ?? [] as zone (zone.id)}
		{@const part = s.parts.find((p) => p.id === zone.partId)}
		{#if part}
			<T.Group position.y={baseFor(s)}>
				<ReuseZoneMesh {zone} {part} structure={s} is3D={store.viewMode === '3d'} />
			</T.Group>
		{/if}
	{/each}
{/each}

{#if zoneDraft && zoneDraft.length >= 2}
	<ParcelLine polygon={zoneDraft} fill color={COLORS.reuse} />
{/if}

{#if ghostPart}
	<PartMesh part={ghostPart} selected={false} ghost />
{/if}

{#if store.selectedPart && store.viewMode === 'plan' && !store.readOnly}
	<ResizeHandles part={store.selectedPart} />
{/if}

{#each store.plan.trees as tree (tree.id)}
	<T.Group position.y={store.ground?.groundAt(tree.x, tree.y) ?? 0}>
		<TreeMesh {tree} selected={store.selectedTreeId === tree.id} is3D={store.viewMode === '3d'} />
	</T.Group>
{/each}
