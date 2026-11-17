<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { OpenSpace } from '../types';
	import { COLORS, OPEN_SPACE_COLORS } from '../colors';
	import ParcelLine from './ParcelLine.svelte';
	import { store } from '../store.svelte';
	import { drapeGeometry } from './drape';

	interface Props {
		openSpace: OpenSpace;
		draft?: boolean;
		selected?: boolean;
	}

	let { openSpace, draft = false, selected = false }: Props = $props();

	const Y_FILL = 0.01;   // above grid, below parts
	const DRAPED_Y = 0.08; // on terrain: above roads and the parcel mask
	const Y_HANDLE = 0.3;
	const HANDLE_R = 0.9;

	function makeGeo(polygon: [number, number][]): THREE.ShapeGeometry | null {
		if (polygon.length < 3) return null;
		const shape = new THREE.Shape();
		shape.moveTo(polygon[0][0], polygon[0][1]);
		for (let i = 1; i < polygon.length; i++) {
			shape.lineTo(polygon[i][0], polygon[i][1]);
		}
		shape.closePath();
		const geo = new THREE.ShapeGeometry(shape);
		// ShapeGeometry lives in XY; rotate so site-y maps to THREE.js +z
		geo.rotateX(Math.PI / 2);
		return geo;
	}

	let flatGeo = $derived(makeGeo(openSpace.polygon));
	// In 3D on terrain, laid on the surface
	let geo = $derived(flatGeo && store.ground ? drapeGeometry(flatGeo, store.ground) : flatGeo);
	let color = $derived(OPEN_SPACE_COLORS[openSpace.kind]);
	let opacity = $derived(draft ? 0.3 : selected ? 0.75 : 0.55);

	// Land to sell: a terracotta hatch, 2 m between lines, laid by world position (ShapeGeometry's
	// UVs are its meters). In plan view it's drawn over the buildings, so those sold with it read hatched.
	let sale = $derived(openSpace.kind === 'sale');
	let onTop = $derived(sale && store.viewMode === 'plan');
	let hatch: THREE.CanvasTexture | null = null;
	function hatchTexture(): THREE.CanvasTexture {
		if (hatch) return hatch;
		const c = document.createElement('canvas');
		c.width = c.height = 32;
		const ctx = c.getContext('2d')!;
		ctx.strokeStyle = COLORS.sale;
		ctx.lineWidth = 3;
		for (const d of [-32, 0, 32]) {
			ctx.beginPath();
			ctx.moveTo(d, 32);
			ctx.lineTo(d + 32, 0);
			ctx.stroke();
		}
		hatch = new THREE.CanvasTexture(c);
		hatch.wrapS = hatch.wrapT = THREE.RepeatWrapping;
		hatch.repeat.set(0.5, 0.5);
		hatch.colorSpace = THREE.SRGBColorSpace;
		return hatch;
	}
</script>

{#if geo && sale}
	<T.Mesh position={[0, store.ground ? DRAPED_Y : Y_FILL, 0]} geometry={geo} renderOrder={onTop ? 9 : 0}>
		<T.MeshBasicMaterial map={hatchTexture()} transparent opacity={draft ? 0.5 : selected ? 1 : 0.85} side={THREE.DoubleSide}
			depthTest={!onTop} depthWrite={false} toneMapped={false}
			polygonOffset={true} polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
	</T.Mesh>
	<ParcelLine polygon={openSpace.polygon} dashed color={COLORS.sale} onTop={onTop} />
{:else if geo}
	<!-- Visible fill — polygonOffset pulls depth toward camera to beat the pedestal -->
	<T.Mesh position={[0, store.ground ? DRAPED_Y : Y_FILL, 0]} geometry={geo}>
		<T.MeshLambertMaterial {color} {opacity} transparent side={THREE.DoubleSide}
			polygonOffset={true} polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
	</T.Mesh>
{/if}
{#if geo}
	<!-- Hit-test mesh (transparent but physically present) -->
	{#if !draft}
		<T.Mesh position={[0, Y_FILL + 0.005, 0]} geometry={geo} userData={{ openSpaceId: openSpace.id }}>
			<T.MeshBasicMaterial opacity={0} transparent side={THREE.DoubleSide} />
		</T.Mesh>
	{/if}
{/if}

<!-- Vertex handles when selected -->
{#if selected}
	{#each openSpace.polygon as pt, i (i)}
		<T.Mesh
			position={[pt[0], Y_HANDLE, pt[1]]}
			userData={{ openSpaceId: openSpace.id, osVertex: i }}
		>
			<T.CylinderGeometry args={[HANDLE_R, HANDLE_R, 0.5, 16]} />
			<T.MeshLambertMaterial color="#2563eb" />
		</T.Mesh>
	{/each}
{/if}
