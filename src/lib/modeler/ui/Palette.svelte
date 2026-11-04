<script lang="ts">
	import type { OpenSpace, Part } from '../types';
	import { store } from '../store.svelte';

	const SHAPES: { shape: Part['shape']; label: string; desc: string }[] = [
		{ shape: 'rect', label: 'Rectangle', desc: 'Bar or wing' },
		{ shape: 'square', label: 'Square', desc: 'Compact volume' },
		{ shape: 'tri', label: 'Triangle', desc: 'Object in space' },
	];

	const OPEN_SPACES: { kind: OpenSpace['kind']; label: string; color: string }[] = [
		{ kind: 'parking', label: 'Parking', color: 'var(--color-os-parking)' },
		{ kind: 'lawn', label: 'Lawn', color: 'var(--color-os-lawn)' },
		{ kind: 'courtyard', label: 'Courtyard', color: 'var(--color-os-courtyard)' },
		{ kind: 'court', label: 'Court', color: 'var(--color-os-court)' },
		{ kind: 'garden', label: 'Garden', color: 'var(--color-os-garden)' },
		{ kind: 'cemetery', label: 'Cemetery', color: 'var(--color-os-cemetery)' },
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
					class="shape-tile shape-tile--{s.shape}"
					draggable="true"
					role="listitem"
					aria-label="Drag to place {s.label}"
					ondragstart={(e) => handleDragStart(e, s.shape)}
				>
					<div class="shape-icon" aria-hidden="true">
						{#if s.shape === 'rect'}
							<svg viewBox="0 0 40 24" width="40" height="24">
								<rect x="1" y="1" width="38" height="22" fill="none" stroke="currentColor" stroke-width="2" />
							</svg>
						{:else if s.shape === 'square'}
							<svg viewBox="0 0 28 28" width="28" height="28">
								<rect x="1" y="1" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" />
							</svg>
						{:else}
							<svg viewBox="0 0 32 28" width="32" height="28">
								<polygon points="16,1 31,27 1,27" fill="none" stroke="currentColor" stroke-width="2" />
							</svg>
						{/if}
					</div>
					<span class="shape-label">{s.label}</span>
					<span class="shape-desc">{s.desc}</span>
				</div>
			</li>
		{/each}
	</ul>

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

	<div class="palette-hint">Drag a shape onto the canvas to place it</div>
</aside>

<style>
	.palette {
		width: 160px;
		flex-shrink: 0;
		background: #f8f5ee;
		border-right: 1px solid #d4c5a9;
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
		color: #6b5f4e;
		margin: 0;
	}

	.shape-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.shape-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0.5rem;
		border: 1.5px solid #d4c5a9;
		border-radius: 4px;
		background: #fff;
		cursor: grab;
		color: #4a3f30;
		transition: border-color 0.1s, background 0.1s;
	}

	.shape-tile:hover {
		border-color: var(--color-selection);
		background: #f0f4ff;
	}

	.shape-tile:active {
		cursor: grabbing;
	}

	.shape-label {
		font-size: 0.75rem;
		font-weight: 600;
	}

	.shape-desc {
		font-size: 0.65rem;
		color: #7a6a56;
		text-align: center;
	}

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
		border: 1.5px solid #d4c5a9;
		border-radius: 4px;
		background: #fff;
		cursor: pointer;
		color: #4a3f30;
		font-size: 0.75rem;
		font-weight: 600;
		text-align: left;
		transition: border-color 0.1s, background 0.1s;
	}

	.os-tile:hover {
		border-color: var(--color-selection);
		background: #f0f4ff;
	}

	.os-tile--active {
		border-color: var(--color-selection);
		background: #e8f0ff;
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

	.palette-hint {
		font-size: 0.65rem;
		color: #9a8a76;
		line-height: 1.4;
		margin-top: auto;
	}
</style>
