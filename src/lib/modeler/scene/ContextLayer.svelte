<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
	import type { SiteContext } from '../types';
	import { COLORS } from '../colors';

	// Neighbors as white foam blocks and roads printed on the base board. Both are built as
	// one merged geometry each: an urban block can hold hundreds of buildings.

	interface Props {
		context: SiteContext;
		is3D: boolean;
	}

	let { context, is3D }: Props = $props();

	const PLAN_SLAB = 0.05;
	const ROAD_Y = 0.004; // just above the board, below open spaces (0.01)
	const FOAM_EDGE = '#cfcac0';

	function makeBuildings(buildings: SiteContext['buildings'], flat: boolean): THREE.BufferGeometry | null {
		const geos = buildings
			.filter((b) => b.polygon.length >= 3)
			.map((b) => {
				const shape = new THREE.Shape(b.polygon.map(([x, y]) => new THREE.Vector2(x, y)));
				const depth = flat ? PLAN_SLAB : b.height;
				const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
				// Same mapping as parts: shape y -> site y (+Z); extrusion -> up
				geo.rotateX(Math.PI / 2);
				geo.translate(0, depth, 0);
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

	function makeRoads(roads: SiteContext['roads']): THREE.BufferGeometry | null {
		const pos: number[] = [];
		const tri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
			pos.push(ax, ROAD_Y, az, bx, ROAD_Y, bz, cx, ROAD_Y, cz);
		for (const { line, kind } of roads) {
			const half = (ROAD_WIDTH[kind] ?? 6) / 2;
			for (let i = 0; i < line.length - 1; i++) {
				const [x1, z1] = line[i];
				const [x2, z2] = line[i + 1];
				const len = Math.hypot(x2 - x1, z2 - z1);
				if (len === 0) continue;
				const nx = (-(z2 - z1) / len) * half;
				const nz = ((x2 - x1) / len) * half;
				tri(x1 + nx, z1 + nz, x2 + nx, z2 + nz, x2 - nx, z2 - nz);
				tri(x1 + nx, z1 + nz, x2 - nx, z2 - nz, x1 - nx, z1 - nz);
			}
			// Discs at the vertices fill the gaps where segments turn
			for (const [x, z] of line) {
				for (let k = 0; k < JOINT_SEGMENTS; k++) {
					const a1 = (k / JOINT_SEGMENTS) * Math.PI * 2;
					const a2 = ((k + 1) / JOINT_SEGMENTS) * Math.PI * 2;
					tri(x, z, x + Math.cos(a1) * half, z + Math.sin(a1) * half, x + Math.cos(a2) * half, z + Math.sin(a2) * half);
				}
			}
		}
		if (pos.length === 0) return null;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geo.computeVertexNormals();
		return geo;
	}

	let buildingGeo = $derived(makeBuildings(context.buildings, !is3D));
	let buildingEdges = $derived(buildingGeo ? new THREE.EdgesGeometry(buildingGeo, 20) : null);
	let roadGeo = $derived(makeRoads(context.roads));
</script>

{#if roadGeo}
	<T.Mesh geometry={roadGeo} receiveShadow>
		<T.MeshLambertMaterial color={COLORS.road} side={THREE.DoubleSide} />
	</T.Mesh>
{/if}

{#if buildingGeo}
	<T.Mesh geometry={buildingGeo} castShadow={is3D} receiveShadow>
		<T.MeshLambertMaterial color={COLORS.context} transparent opacity={is3D ? 0.88 : 1} side={THREE.DoubleSide} />
	</T.Mesh>
	{#if buildingEdges}
		<T.LineSegments geometry={buildingEdges}>
			<T.LineBasicMaterial color={FOAM_EDGE} />
		</T.LineSegments>
	{/if}
{/if}
