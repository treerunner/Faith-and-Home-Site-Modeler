<script lang="ts">
	import type { Part } from '../types';

	const SHAPES: { shape: Part['shape']; label: string; desc: string }[] = [
		{ shape: 'rect', label: 'Rectangle', desc: 'Bar or wing' },
		{ shape: 'square', label: 'Square', desc: 'Compact volume' },
		{ shape: 'tri', label: 'Triangle', desc: 'Object in space' },
	];

	function handleDragStart(e: DragEvent, shape: Part['shape']) {
		e.dataTransfer!.effectAllowed = 'copy';
		e.dataTransfer!.setData('text/plain', shape);
	}
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

	.palette-hint {
		font-size: 0.65rem;
		color: #9a8a76;
		line-height: 1.4;
		margin-top: auto;
	}
</style>
