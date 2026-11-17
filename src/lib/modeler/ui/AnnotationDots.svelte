<script lang="ts">
	import { untrack } from 'svelte';
	import { store } from '../store.svelte';
	import { clientToSite, mainView, topBelow, worldToScreen, type SceneView } from '../scene/cameraRef';
	import type { Plan } from '../types';

	// The pattern book's numbered dots, over the canvas while the Notes drawer is open.
	// In plan view a dot can be dragged; a click opens its text in the drawer.
	// Compare draws each plan's over its own view, always shown, not editable.
	interface Props { plan?: Plan; view?: SceneView; always?: boolean }
	let { plan: shown, view = mainView, always = false }: Props = $props();
	let plan = $derived(shown ?? store.plan);
	let visible = $derived(always || store.showNotes);

	// Re-project on resize, after a plan view pan or zoom, and every frame in 3D (as the labels do)
	let viewVersion = $state(0);
	$effect(() => {
		untrack(() => viewVersion++);
		const onResize = () => viewVersion++;
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});
	$effect(() => {
		void store.planView;
		const raf = requestAnimationFrame(() => viewVersion++);
		return () => cancelAnimationFrame(raf);
	});
	$effect(() => {
		if (store.viewMode !== '3d' || !visible) return;
		let raf: number;
		const loop = () => {
			viewVersion++;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	// Where each dot lands on screen; none for a dot off the canvas
	function place(x: number, y: number) {
		// In 3D, on whatever is under it (a roof or the ground); off the board, nothing is drawn
		let screen;
		if (store.viewMode === '3d') {
			const top = topBelow(x, y, view);
			if (top === null) return null;
			screen = worldToScreen(x, y, view.perspCamera ?? undefined, top + 0.5, view);
		} else screen = worldToScreen(x, y, undefined, 0, view);
		const r = view.el?.getBoundingClientRect();
		if (!screen || !r || screen.x < r.left || screen.x > r.right || screen.y < r.top || screen.y > r.bottom) return null;
		return screen;
	}

	let dots = $derived(
		visible
			? plan.annotations.map((a) => {
					void viewVersion;
					return { a, screen: place(a.x, a.y) };
				})
			: [],
	);

	let draggable = $derived(!always && !store.readOnly && store.viewMode === 'plan');

	function down(e: PointerEvent, n: number) {
		e.stopPropagation();
		if (always) return;
		if (!draggable) {
			store.focusNote = n;
			return;
		}
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		store.startNoteDrag(n);
	}

	function move(e: PointerEvent) {
		if (store.mode.type !== 'draggingNote') return;
		const pos = clientToSite(e.clientX, e.clientY, view);
		if (pos) store.dragNote(pos.x, pos.y);
	}
</script>

{#each dots as { a, screen } (a.n)}
	{#if screen}
		<button
			class="note-dot"
			class:note-dot--hover={store.hoveredNote === a.n}
			class:note-dot--draggable={draggable}
			style="left:{screen.x}px; top:{screen.y}px"
			aria-label="Note {a.n}{a.text ? `: ${a.text}` : ''}"
			title={a.text || undefined}
			onpointerdown={(e) => down(e, a.n)}
			onpointermove={move}
			onpointerup={() => store.endNoteDrag()}
			onpointerenter={() => (store.hoveredNote = a.n)}
			onpointerleave={() => (store.hoveredNote = null)}
		>{a.n}</button>
	{/if}
{/each}

<style>
	/* The book's dot, in dusk blue (orange is new construction in the model), with a bold white number */
	.note-dot {
		position: fixed;
		z-index: 4; /* over the canvas and labels, under the drawer */
		transform: translate(-50%, -50%);
		width: 28px;
		height: 28px;
		padding: 0;
		border: 2px solid #fff;
		border-radius: 50%;
		background: var(--color-note);
		color: #fff;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		box-shadow: 0 1px 3px rgba(0 0 0 / 0.25);
		cursor: pointer;
		user-select: none;
		touch-action: none;
	}
	.note-dot--draggable { cursor: grab; }
	.note-dot--draggable:active { cursor: grabbing; }
	.note-dot--hover { outline: 3px solid color-mix(in srgb, var(--color-note) 40%, transparent); }
</style>
