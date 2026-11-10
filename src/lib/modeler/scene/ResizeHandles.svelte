<script lang="ts">
	import { T } from '@threlte/core';
	import type { Part } from '../types';
	import type { ResizeHandle } from '../interaction';
	import { COLORS } from '../colors';

	interface Props {
		part: Part;
	}

	let { part }: Props = $props();

	const SIZE = 2.0; // handle cube side in meters (~16 px at default zoom)
	const Y = 0.3; // height above grid

	interface Handle {
		id: ResizeHandle;
		x: number;
		y: number;
	}

	function rotatedCorners() {
		const θ = (part.rotation * Math.PI) / 180;
		const c = Math.cos(θ), s = Math.sin(θ);
		function pt(dx: number, dy: number) {
			return { x: part.x + dx * c - dy * s, y: part.y + dx * s + dy * c };
		}
		const hw = part.w / 2, hd = part.d / 2;
		return {
			handles: [
				{ id: 'nw' as ResizeHandle, ...pt(-hw,  hd) },
				{ id: 'ne' as ResizeHandle, ...pt( hw,  hd) },
				{ id: 'se' as ResizeHandle, ...pt( hw, -hd) },
				{ id: 'sw' as ResizeHandle, ...pt(-hw, -hd) },
			],
			rot: pt(0, hd + 1.5),
		};
	}

	let corners = $derived(rotatedCorners());
	let handles = $derived(corners.handles);
	let rotHandleX = $derived(corners.rot.x);
	let rotHandleY = $derived(corners.rot.y);
</script>

{#each handles as h (h.id)}
	<T.Mesh
		position={[h.x, Y, h.y]}
		userData={{ handle: h.id, partId: part.id }}
	>
		<T.BoxGeometry args={[SIZE, SIZE, SIZE]} />
		<T.MeshLambertMaterial color={COLORS.selection} />
	</T.Mesh>
{/each}

<!-- Rotation handle -->
<T.Mesh
	position={[rotHandleX, Y, rotHandleY]}
	userData={{ rotateHandle: true, partId: part.id }}
>
	<T.CylinderGeometry args={[SIZE / 2, SIZE / 2, SIZE, 16]} />
	<T.MeshLambertMaterial color="#7c3aed" />
</T.Mesh>
