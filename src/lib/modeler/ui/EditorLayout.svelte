<script lang="ts">
	import Palette from './Palette.svelte';
	import Scene from '../scene/Scene.svelte';
	import { store } from '../store.svelte';
	import { clientToSite, hitTest, rendererEl } from '../scene/cameraRef';
	import type { Part } from '../types';
	import type { ResizeHandle } from '../interaction';

	// ── Drag-and-drop from palette ──────────────────────────────────────────

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!e.dataTransfer) return;
		e.dataTransfer.dropEffect = 'copy';

		const shape = e.dataTransfer.types.includes('text/plain')
			? (e.dataTransfer.getData?.('text/plain') as Part['shape'] | '')
			: '';
		const activeShape =
			shape || (store.mode.type === 'placing' ? store.mode.shape : null);
		if (!activeShape) return;

		const pos = clientToSite(e.clientX, e.clientY);
		if (pos) store.updateGhostPos(activeShape as Part['shape'], pos.x, pos.y);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const shape = e.dataTransfer?.getData('text/plain') as Part['shape'] | undefined;
		if (!shape || !['rect', 'square', 'tri'].includes(shape)) return;
		const pos = clientToSite(e.clientX, e.clientY);
		if (!pos) return;
		store.placePart(shape, pos.x, pos.y);
	}

	function handleDragLeave() {
		store.cancelPlacing();
	}

	// ── Pointer events ──────────────────────────────────────────────────────

	function handlePointerDown(e: PointerEvent) {
		// Ignore DnD synthetic events
		if (e.buttons === 0) return;

		const result = hitTest(e.clientX, e.clientY);
		if (!result) return;

		if (result.kind === 'part' && result.partId !== '__ghost__') {
			const part = store.allParts.find((p) => p.id === result.partId);
			if (!part) return;
			rendererEl?.setPointerCapture(e.pointerId);
			store.startDragging(result.partId, result.x - part.x, result.y - part.y);
		} else if (result.kind === 'resize') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startResizing(result.partId, result.handle as ResizeHandle);
		} else if (result.kind === 'rotate') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startRotating(result.partId, result.x, result.y);
		} else {
			// Ground: deselect
			store.selectPart(null);
		}
	}

	function handlePointerMove(e: PointerEvent) {
		const pos = clientToSite(e.clientX, e.clientY);
		if (!pos) return;

		if (store.mode.type === 'dragging') {
			store.updateDrag(pos.x, pos.y);
		} else if (store.mode.type === 'resizing') {
			store.updateResize(pos.x, pos.y);
		} else if (store.mode.type === 'rotating') {
			store.updateRotation(pos.x, pos.y, e.shiftKey);
		}
	}

	function handlePointerUp() {
		if (store.mode.type === 'dragging') store.endDrag();
		else if (store.mode.type === 'resizing') store.endResize();
		else if (store.mode.type === 'rotating') store.endRotation();
	}
</script>

<div class="editor">
	<Palette />
	<div class="canvas-area">
		<Scene
			ondragover={handleDragOver}
			ondrop={handleDrop}
			ondragleave={handleDragLeave}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointerdown={handlePointerDown}
		/>
	</div>
</div>

<style>
	.editor {
		display: flex;
		width: 100%;
		height: 100%;
	}

	.canvas-area {
		flex: 1;
		min-width: 0;
		position: relative;
	}
</style>
