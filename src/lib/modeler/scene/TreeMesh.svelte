<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Tree } from '../types';

	interface Props {
		tree: Tree;
		selected: boolean;
		is3D: boolean;
	}

	let { tree, selected, is3D }: Props = $props();

	const CANOPY_COLOR = '#8fa88f';
	const CANOPY_COLOR_SELECTED = '#6a81b9';
	const TRUNK_COLOR = '#a89070';

	let color = $derived(selected ? CANOPY_COLOR_SELECTED : CANOPY_COLOR);

	let trunkH = $derived(tree.height * 0.35);
	let coneH = $derived(tree.height * 0.65);
</script>

{#if is3D}
	<!-- Trunk -->
	<T.Mesh position={[tree.x, trunkH / 2, tree.y]} userData={{ treeId: tree.id }}>
		<T.CylinderGeometry args={[0.2, 0.25, trunkH, 8]} />
		<T.MeshLambertMaterial color={TRUNK_COLOR} />
	</T.Mesh>
	<!-- Canopy cone -->
	<T.Mesh
		position={[tree.x, trunkH + coneH / 2, tree.y]}
		userData={{ treeId: tree.id }}
		castShadow
	>
		<T.ConeGeometry args={[tree.radius, coneH, 8]} />
		<T.MeshLambertMaterial {color} />
	</T.Mesh>
{:else}
	<!-- Plan view: flat disc -->
	<T.Mesh
		position={[tree.x, 0.05, tree.y]}
		rotation={[-Math.PI / 2, 0, 0]}
		userData={{ treeId: tree.id }}
	>
		<T.CircleGeometry args={[tree.radius, 16]} />
		<T.MeshLambertMaterial {color} />
	</T.Mesh>
{/if}
