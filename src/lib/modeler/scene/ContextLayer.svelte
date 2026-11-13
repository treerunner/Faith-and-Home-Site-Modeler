<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
	import type { SiteContext } from '../types';
	import { COLORS } from '../colors';
	import { footingOf, type TerrainSurface, type TerrainModel } from '../terrain';
	import { drapeGeometry } from './drape';

	// Neighbors as white foam blocks and roads printed on the base board. Both are built as
	// one merged geometry each: an urban block can hold hundreds of buildings.

	interface Props {
		context: SiteContext;
		half: number; // board half-width
		is3D: boolean;
		terrain: TerrainModel | null; // in 3D: foam meets the ground flush, full height uphill
		surface: TerrainSurface | null; // in 3D: roads lie on it
	}

	let { context, half, is3D, terrain, surface }: Props = $props();

	// Foam, road print and board skip tone mapping: the renderer's filmic curve greys off-white
	// down, and these must read as white foam and light print against the chipboard.
	const PLAN_SLAB = 0.05;
	// Printed on the board: nearly flush, and polygonOffset (not height) keeps roads on top of
	// the board at any distance while staying under open spaces (offset -2)
	const ROAD_Y = 0.002;
	// On terrain, everything printed is lifted a little more: on a slope a few millimeters lose
	// the depth test as the camera turns, and roads speckle. Order: roads, parcel mask, open spaces.
	const DRAPED_ROAD_Y = 0.04;
	const FOAM_EDGE = '#cfcac0';

	function makeBuildings(buildings: SiteContext['buildings'], flat: boolean, model: TerrainModel | null): THREE.BufferGeometry | null {
		const geos = buildings
			.filter((b) => b.polygon.length >= 3)
			.map((b) => {
				const shape = new THREE.Shape(b.polygon.map(([x, y]) => new THREE.Vector2(x, y)));
				// On terrain: from the lowest ground under it, its height above the highest
				const footing = model ? footingOf(model, b.polygon) : { base: 0, floor: 0 };
				const depth = flat ? PLAN_SLAB : b.height + footing.floor - footing.base;
				const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
				// Same mapping as parts: shape y -> site y (+Z); extrusion -> up
				geo.rotateX(Math.PI / 2);
				geo.translate(0, depth + footing.base, 0);
				return geo;
			});
		return geos.length ? mergeGeometries(geos) : null;
	}

	// Road widths in meters by OSM highway kind; drawn as flat ribbons with round joints
	const ROAD_WIDTH: Record<string, number> = {
		motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9,
		residential: 7, unclassified: 7, living_street: 6, service: 4,
	};
	const JOINT_SEGMENTS = 10;

	function makeRoads(roads: SiteContext['roads'], half: number, surface: TerrainSurface | null): THREE.BufferGeometry | null {
		const pos: number[] = [];
		// Clamped to the board so the print stops at its edge instead of overhanging
		const c = (v: number) => Math.max(-half, Math.min(half, v));
		const tri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
			pos.push(c(ax), ROAD_Y, c(az), c(bx), ROAD_Y, c(bz), c(cx), ROAD_Y, c(cz));
		for (const { line, kind } of roads) {
			const halfWidth = (ROAD_WIDTH[kind] ?? 6) / 2;
			for (let i = 0; i < line.length - 1; i++) {
				const [x1, z1] = line[i];
				const [x2, z2] = line[i + 1];
				const len = Math.hypot(x2 - x1, z2 - z1);
				if (len === 0) continue;
				const nx = (-(z2 - z1) / len) * halfWidth;
				const nz = ((x2 - x1) / len) * halfWidth;
				tri(x1 + nx, z1 + nz, x2 + nx, z2 + nz, x2 - nx, z2 - nz);
				tri(x1 + nx, z1 + nz, x2 - nx, z2 - nz, x1 - nx, z1 - nz);
			}
			// Discs at interior vertices fill the gaps where segments turn; ends stay square
			for (const [x, z] of line.slice(1, -1)) {
				for (let k = 0; k < JOINT_SEGMENTS; k++) {
					const a1 = (k / JOINT_SEGMENTS) * Math.PI * 2;
					const a2 = ((k + 1) / JOINT_SEGMENTS) * Math.PI * 2;
					tri(x, z, x + Math.cos(a1) * halfWidth, z + Math.sin(a1) * halfWidth, x + Math.cos(a2) * halfWidth, z + Math.sin(a2) * halfWidth);
				}
			}
		}
		if (pos.length === 0) return null;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		if (surface) {
			const draped = drapeGeometry(geo, surface);
			draped.translate(0, DRAPED_ROAD_Y, 0);
			return draped;
		}
		geo.computeVertexNormals();
		return geo;
	}

	let buildingGeo = $derived(makeBuildings(context.buildings, !is3D, terrain));
	let buildingEdges = $derived(buildingGeo ? new THREE.EdgesGeometry(buildingGeo, 20) : null);
	let roadGeo = $derived(makeRoads(context.roads, half, surface));
</script>

{#if roadGeo}
	<T.Mesh geometry={roadGeo} receiveShadow>
		<T.MeshBasicMaterial
			color={COLORS.road}
			toneMapped={false}
			side={THREE.DoubleSide}
			polygonOffset
			polygonOffsetFactor={-1}
			polygonOffsetUnits={-1}
		/>
	</T.Mesh>
{/if}

{#if buildingGeo}
	<T.Mesh geometry={buildingGeo} castShadow={is3D} receiveShadow>
		{#if is3D}
			<!-- Emissive lift keeps foam white on top while walls still shade -->
			<!-- Front faces only: the bottom cap sits on the board and would flicker through translucent walls -->
			<T.MeshLambertMaterial color={COLORS.context} emissive={COLORS.context} emissiveIntensity={0.45} toneMapped={false} transparent opacity={0.92} side={THREE.FrontSide} />
		{:else}
			<T.MeshBasicMaterial color={COLORS.context} toneMapped={false} side={THREE.DoubleSide} />
		{/if}
	</T.Mesh>
	{#if buildingEdges}
		<T.LineSegments geometry={buildingEdges}>
			<T.LineBasicMaterial color={FOAM_EDGE} />
		</T.LineSegments>
	{/if}
{/if}
