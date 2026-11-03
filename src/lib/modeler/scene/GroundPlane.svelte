<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import { store } from '../store.svelte';

	function handleClick() {
		// Deselect when clicking empty ground
		store.selectPart(null);
	}
</script>

<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onclick={handleClick}>
	<T.PlaneGeometry args={[400, 400]} />
	<T.MeshBasicMaterial visible={false} side={THREE.DoubleSide} />
</T.Mesh>
