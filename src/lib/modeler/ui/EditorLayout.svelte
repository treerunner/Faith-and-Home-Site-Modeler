<script lang="ts">
	import Palette from './Palette.svelte';
	import PropertiesPanel from './PropertiesPanel.svelte';
	import OpenSpaceLabels from './OpenSpaceLabels.svelte';
	import AnalysisModal from './AnalysisModal.svelte';
	import SiteBar from './SiteBar.svelte';
	import Scene from '../scene/Scene.svelte';
	import { store } from '../store.svelte';
	import { clientToSite, hitTest, rendererEl } from '../scene/cameraRef';
	import { exportPNG } from '../sceneExport';
	import type { Part } from '../types';
	import type { ResizeHandle } from '../interaction';

	let canvasAreaEl: HTMLDivElement | undefined = $state();
	let viewModeBeforeAnalysis = $state<'plan' | '3d'>('plan');

	function openAnalysis() {
		viewModeBeforeAnalysis = store.viewMode;
		store.viewMode = 'plan'; // ensure plan-view scene before modal mounts
		store.selectPart(null);  // clear selection so handles don't appear in thumbnail
		store.selectOpenSpace(null);
		store.selectTree(null);
		store.showAnalysis = true;
	}

	// ── Drag-and-drop from palette ──────────────────────────────────────────

	function handleDragOver(e: DragEvent) {
		if (store.readOnly) return;
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
		if (store.readOnly) return;
		const shape = e.dataTransfer?.getData('text/plain') as Part['shape'] | undefined;
		if (!shape || !['rect', 'square', 'tri', 'circle'].includes(shape)) return;
		const pos = clientToSite(e.clientX, e.clientY);
		if (!pos) return;
		store.placePart(shape, pos.x, pos.y);
	}

	function handleDragLeave() {
		store.cancelPlacing();
	}

	// ── Pointer events ──────────────────────────────────────────────────────

	function handlePointerDown(e: PointerEvent) {
		if (e.buttons === 0) return;
		if (store.viewMode === '3d') return;

		if (store.mode.type === 'placingTree') {
			const pos = clientToSite(e.clientX, e.clientY);
			if (!pos) return;
			store.placeTree(pos.x, pos.y);
			return;
		}

		if (store.mode.type === 'drawingOpenSpace') {
			const pos = clientToSite(e.clientX, e.clientY);
			if (!pos) return;
			store.addOpenSpaceVertex(pos.x, pos.y);
			return;
		}

		const result = hitTest(e.clientX, e.clientY);
		if (!result) return;

		if (store.readOnly) {
			// View only: clicking a part shows its structure in the panel; nothing moves
			const owner =
				result.kind === 'part' &&
				store.site.structures.find((s) => s.parts.some((p) => p.id === result.partId));
			if (owner) store.selectStructure(owner.id);
			else store.selectPart(null);
			return;
		}

		if (result.kind === 'part' && result.partId !== '__ghost__') {
			let partId = result.partId;
			const cloning = e.altKey;
			if (cloning) {
				const newId = store.duplicateStructure(partId);
				if (newId) partId = newId;
			}
			const part = store.allParts.find((p) => p.id === partId);
			if (!part) return;
			const ownerStructure = store.site.structures.find((s) =>
				s.parts.some((p) => p.id === partId),
			);
			if (ownerStructure) store.setActiveStructure(ownerStructure.id);
			rendererEl?.setPointerCapture(e.pointerId);
			store.startDragging(partId, result.x - part.x, result.y - part.y, cloning);
		} else if (result.kind === 'resize') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startResizing(result.partId, result.handle as ResizeHandle);
		} else if (result.kind === 'rotate') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startRotating(result.partId, result.x, result.y);
		} else if (result.kind === 'osVertex') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startDraggingOsVertex(result.openSpaceId, result.vertexIndex);
		} else if (result.kind === 'openSpace') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startDraggingOpenSpace(result.openSpaceId, result.x, result.y);
		} else if (result.kind === 'tree') {
			rendererEl?.setPointerCapture(e.pointerId);
			store.startDraggingTree(result.treeId, result.x - (store.site.trees.find(t => t.id === result.treeId)?.x ?? 0), result.y - (store.site.trees.find(t => t.id === result.treeId)?.y ?? 0));
		} else {
			// Ground: deselect everything
			store.selectPart(null);
			store.selectOpenSpace(null);
			store.selectTree(null);
		}
	}

	function handlePointerMove(e: PointerEvent) {
		const pos = clientToSite(e.clientX, e.clientY);
		if (!pos) return;

		if (store.mode.type === 'draggingTree') {
			store.updateDragTree(pos.x, pos.y);
		} else if (store.mode.type === 'dragging') {
			store.updateDrag(pos.x, pos.y);
		} else if (store.mode.type === 'resizing') {
			store.updateResize(pos.x, pos.y, e.shiftKey);
		} else if (store.mode.type === 'rotating') {
			store.updateRotation(pos.x, pos.y, e.shiftKey);
		} else if (store.mode.type === 'drawingOpenSpace') {
			store.updateOpenSpaceCursor(pos.x, pos.y);
		} else if (store.mode.type === 'draggingOpenSpace') {
			store.updateDragOpenSpace(pos.x, pos.y);
		} else if (store.mode.type === 'draggingOsVertex') {
			store.updateDragOsVertex(pos.x, pos.y);
		}
	}

	function handlePointerUp() {
		if (store.mode.type === 'dragging') store.endDrag();
		else if (store.mode.type === 'resizing') store.endResize();
		else if (store.mode.type === 'rotating') store.endRotation();
		else if (store.mode.type === 'draggingOpenSpace') store.endDragOpenSpace();
		else if (store.mode.type === 'draggingOsVertex') store.endDragOsVertex();
		else if (store.mode.type === 'draggingTree') store.endDragTree();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (store.showAnalysis) { store.showAnalysis = false; store.viewMode = viewModeBeforeAnalysis; return; }
			if (store.mode.type === 'drawingOpenSpace' || store.mode.type === 'placingTree') store.cancelPlacing();
			else if (store.selectedOpenSpaceId) store.selectOpenSpace(null);
			else if (store.selectedTreeId) store.selectTree(null);
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === document.body && !store.readOnly) {
			if (store.selectedPartId) store.deletePart(store.selectedPartId);
			else if (store.selectedOpenSpaceId) store.deleteOpenSpace(store.selectedOpenSpaceId);
			else if (store.selectedTreeId) store.deleteTree(store.selectedTreeId);
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="editor">
	{#if !store.readOnly}
		<Palette />
	{/if}
	<div class="canvas-area" bind:this={canvasAreaEl}>
		<Scene
			ondragover={handleDragOver}
			ondrop={handleDrop}
			ondragleave={handleDragLeave}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointerdown={handlePointerDown}
		/>
		<OpenSpaceLabels />

		{#if store.viewMode === 'plan'}
			<div class="scale-bar" aria-label="Scale: 33 feet">
				<div class="scale-bar__line"></div>
				<span class="scale-bar__label">33 ft</span>
			</div>
		{/if}

		{#if store.mode.type === 'drawingOpenSpace'}
			<div class="drawing-hint">
				{#if store.mode.points.length === 0}
					Click to place first point. Esc to cancel.
				{:else if store.mode.points.length < 3}
					{store.mode.points.length} point{store.mode.points.length > 1 ? 's' : ''} placed. Need at least 3.
				{:else}
					{store.mode.points.length} points. Click the orange dot to close the shape.
				{/if}
			</div>
		{/if}

		<div class="view-toolbar">
			<div class="view-tabs" role="group" aria-label="View mode">
				<button
					class="view-tab"
					class:view-tab--active={store.viewMode === 'plan'}
					onclick={() => { store.viewMode = 'plan'; }}
				>Plan</button>
				<button
					class="view-tab"
					class:view-tab--active={store.viewMode === '3d'}
					onclick={() => { store.viewMode = '3d'; }}
				>3D</button>
			</div>
			<button
				class="labels-btn"
				class:labels-btn--off={!store.showLabels}
				onclick={() => { store.showLabels = !store.showLabels; }}
				title="Toggle open space labels"
			>Labels</button>
			<button
				class="export-btn"
				disabled={store.viewMode !== '3d'}
				onclick={() => exportPNG()}
				title="Export PNG"
			>↓ PNG</button>
			<button
				class="analysis-btn"
				onclick={openAnalysis}
				title="Open analysis report"
			>Analysis</button>
			<SiteBar />
		</div>
	</div>
	<PropertiesPanel />
	{#if store.showAnalysis}
		<AnalysisModal previousViewMode={viewModeBeforeAnalysis} />
	{/if}
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
		container-type: size;
	}

	.scale-bar {
		position: absolute;
		bottom: 3rem;
		right: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		pointer-events: none;
	}

	/* 10m = 10% of canvas height (camera shows 100m vertically) */
	.scale-bar__line {
		width: 10cqh;
		height: 3px;
		background: var(--color-text);
		border-left: 2px solid var(--color-text);
		border-right: 2px solid var(--color-text);
	}

	.scale-bar__label {
		font-size: 0.65rem;
		color: var(--color-text);
		font-weight: 600;
	}

	.drawing-hint {
		position: absolute;
		bottom: 2.75rem;
		left: 50%;
		translate: -50% 0;
		background: rgba(0 0 0 / 0.65);
		color: #fff;
		font-size: 0.7rem;
		padding: 0.3rem 0.75rem;
		border-radius: 4px;
		pointer-events: none;
		white-space: nowrap;
	}

	.view-toolbar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.5rem;
		background: rgba(247 247 242 / 0.95);
		border-top: 1px solid var(--color-border);
		gap: 0.5rem;
	}

	.view-tabs {
		display: flex;
		gap: 2px;
		background: var(--color-border);
		border-radius: 4px;
		padding: 2px;
	}

	.view-tab {
		padding: 0.2rem 0.6rem;
		border: none;
		border-radius: 3px;
		background: transparent;
		font-size: 0.7rem;
		color: var(--color-text);
		cursor: pointer;
		font-weight: 500;
	}

	.view-tab:hover { background: rgba(255 255 255 / 0.6); }

	.view-tab--active {
		background: #fff;
		color: var(--color-text);
		font-weight: 600;
		box-shadow: 0 1px 2px rgba(0 0 0 / 0.1);
	}

	.export-btn {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.7rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.export-btn:hover:not(:disabled) { background: #ece8e0; }
	.export-btn:disabled { opacity: 0.4; cursor: default; }

	.labels-btn {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.7rem;
		color: var(--color-text);
		cursor: pointer;
	}
	.labels-btn:hover { background: #ece8e0; }
	.labels-btn--off { opacity: 0.45; }

	.analysis-btn {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.7rem;
		color: var(--color-text);
		cursor: pointer;
	}
	.analysis-btn:hover { background: #ece8e0; }
</style>
