<script lang="ts">
	import type { OpenSpace, Part } from '../types';
	import { store } from '../store.svelte';

	const SHAPES: { shape: Part['shape']; label: string }[] = [
		{ shape: 'square', label: 'Square' },
		{ shape: 'circle', label: 'Circle' },
		{ shape: 'tri', label: 'Triangle' },
	];

	const OPEN_SPACES: { kind: OpenSpace['kind']; label: string; color: string }[] = [
		{ kind: 'parking', label: 'Parking', color: 'var(--color-os-parking)' },
		{ kind: 'lawn', label: 'Lawn', color: 'var(--color-os-lawn)' },
		{ kind: 'courtyard', label: 'Courtyard', color: 'var(--color-os-courtyard)' },
		{ kind: 'garden', label: 'Garden', color: 'var(--color-os-garden)' },
		{ kind: 'cemetery', label: 'Cemetery', color: 'var(--color-os-cemetery)' },
		{ kind: 'walkway', label: 'Walkway', color: 'var(--color-os-walkway)' },
	];

	function handleDragStart(e: DragEvent, shape: Part['shape']) {
		e.dataTransfer!.effectAllowed = 'copy';
		e.dataTransfer!.setData('text/plain', shape);
	}

	function startDrawing(kind: OpenSpace['kind']) {
		store.startDrawingOpenSpace(kind);
	}

	let drawingKind = $derived(
		store.mode.type === 'drawingOpenSpace' ? store.mode.kind : null,
	);
</script>

<aside class="palette" aria-label="Shape palette">
	<h2 class="palette-heading">Palette</h2>
	<ul class="shape-list" role="list">
		{#each SHAPES as s (s.shape)}
			<li>
				<div
					class="shape-tile"
					draggable="true"
					role="listitem"
					title={s.label}
					aria-label="Drag to place {s.label}"
					ondragstart={(e) => handleDragStart(e, s.shape)}
				>
					{#if s.shape === 'square'}
						<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
							<rect x="1" y="1" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" />
						</svg>
					{:else if s.shape === 'circle'}
						<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
							<circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" />
						</svg>
					{:else}
						<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
							<polygon points="14,2 27,26 1,26" fill="none" stroke="currentColor" stroke-width="2" />
						</svg>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	<div class="palette-hint">Drag a shape onto the canvas to place it</div>

	<h2 class="palette-heading palette-heading--section">Open Spaces</h2>
	<ul class="os-list" role="list">
		{#each OPEN_SPACES as os (os.kind)}
			<li>
				<button
					class="os-tile"
					class:os-tile--active={drawingKind === os.kind}
					onclick={() => startDrawing(os.kind)}
					aria-label="Draw {os.label}"
					aria-pressed={drawingKind === os.kind}
				>
					<span class="os-swatch" style="background:{os.color}"></span>
					<span class="os-label">{os.label}</span>
				</button>
			</li>
		{/each}
	</ul>

	<h2 class="palette-heading palette-heading--section">Trees</h2>
	<button
		class="tree-btn"
		class:tree-btn--active={store.mode.type === 'placingTree'}
		onclick={() => store.mode.type === 'placingTree' ? store.cancelPlacing() : store.startPlacingTree()}
		aria-pressed={store.mode.type === 'placingTree'}
	>
		<span class="tree-icon" aria-hidden="true">▲</span>
		<span>Place tree</span>
	</button>

</aside>

<style>
	.palette {
		width: 160px;
		flex-shrink: 0;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		padding: 1rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		user-select: none;
	}

	.palette-heading {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);
		margin: 0;
	}

	.shape-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: row;
		gap: 0.35rem;
	}

	.shape-tile {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem;
		border: 1.5px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-surface);
		cursor: grab;
		color: var(--color-text);
		transition: border-color 0.1s, background 0.1s;
		flex: 1;
	}

	.shape-tile:hover {
		border-color: var(--color-selection);
		background: var(--fh-dusk-tint);
	}

	.shape-tile:active { cursor: grabbing; }

	.palette-heading--section {
		margin-top: 0.5rem;
	}

	.os-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.os-tile {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1.5px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-surface);
		cursor: pointer;
		color: var(--color-text);
		font-size: 0.75rem;
		font-weight: 600;
		text-align: left;
		transition: border-color 0.1s, background 0.1s;
	}

	.os-tile:hover {
		border-color: var(--color-selection);
		background: var(--fh-dusk-tint);
	}

	.os-tile--active {
		border-color: var(--color-selection);
		background: var(--fh-dusk-tint);
	}

	.os-swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 2px;
		flex-shrink: 0;
		border: 1px solid rgba(0 0 0 / 0.15);
	}

	.os-label {
		flex: 1;
	}

	.tree-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1.5px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-surface);
		cursor: pointer;
		color: var(--color-text);
		font-size: 0.75rem;
		font-weight: 600;
		text-align: left;
		transition: border-color 0.1s, background 0.1s;
	}

	.tree-btn:hover { border-color: var(--color-selection); background: var(--fh-dusk-tint); }

	.tree-btn--active {
		border-color: var(--color-selection);
		background: var(--fh-dusk-tint);
	}

	.tree-icon {
		color: #8fa88f;
		font-size: 0.85rem;
		line-height: 1;
	}

	.palette-hint {
		font-size: 0.65rem;
		color: var(--color-text);
		line-height: 1.4;
		opacity: 0.6;
	}
</style>
