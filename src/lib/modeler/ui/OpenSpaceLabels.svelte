<script lang="ts">
	import { untrack } from 'svelte';
	import { store } from '../store.svelte';
	import { worldToScreen } from '../scene/cameraRef';
	import { OPEN_SPACE_COLORS } from '../colors';
	import type { OpenSpace } from '../types';

	// Shoelace formula for polygon area in m²
	function polygonArea(pts: [number, number][]): number {
		let area = 0;
		const n = pts.length;
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			area += pts[i][0] * pts[j][1];
			area -= pts[j][0] * pts[i][1];
		}
		return Math.abs(area) / 2;
	}

	function centroid(pts: [number, number][]): [number, number] {
		const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
		const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
		return [x, y];
	}

	function parkingSpaces(area: number): number {
		return Math.floor(area / 27); // ~1 space per 27 m² (stall + share of aisle)
	}

	// Bump to re-derive positions after resize or camera setup.
	// untrack prevents the read in ++ from creating a loop dependency.
	let viewVersion = $state(0);
	$effect(() => {
		untrack(() => { viewVersion++; }); // re-compute after rendererEl is set on mount
		const onResize = () => { viewVersion++; };
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	interface LabelEntry {
		os: OpenSpace;
		screen: { x: number; y: number } | null;
		area: number;
		displayName: string;
		parking: number | null;
		selected: boolean;
	}

	let entries = $derived<LabelEntry[]>(
		store.site.openSpaces.map((os) => {
			void viewVersion; // re-derive on resize
			const c = centroid(os.polygon);
			const screen = worldToScreen(c[0], c[1]);
			const area = polygonArea(os.polygon);
			return {
				os,
				screen,
				area,
				displayName:
					os.label ||
					os.kind.charAt(0).toUpperCase() + os.kind.slice(1).replace('_', ' '),
				parking: os.kind === 'parking' ? parkingSpaces(area) : null,
				selected: store.selectedOpenSpaceId === os.id,
			};
		}),
	);

	function handleLabelClick(e: MouseEvent, osId: string) {
		e.stopPropagation();
		store.selectOpenSpace(osId);
	}
</script>

{#each entries as entry (entry.os.id)}
	{#if entry.screen}
		{@const color = OPEN_SPACE_COLORS[entry.os.kind]}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="os-label"
			class:os-label--selected={entry.selected}
			style="left:{entry.screen.x}px; top:{entry.screen.y}px; --accent:{color}"
			onclick={(e) => handleLabelClick(e, entry.os.id)}
		>
			<span class="os-label__name">{entry.displayName}</span>
			{#if entry.parking !== null && entry.parking > 0}
				<span class="os-label__count">~{entry.parking} spaces</span>
			{:else}
				<span class="os-label__area">{Math.round(entry.area)} m²</span>
			{/if}
		</div>
	{/if}
{/each}

<style>
	.os-label {
		position: fixed;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		pointer-events: auto;
		cursor: pointer;
		user-select: none;
	}

	.os-label__name {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #2a1f10;
		background: color-mix(in srgb, var(--accent) 70%, white);
		padding: 1px 5px;
		border-radius: 3px;
		border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
		white-space: nowrap;
	}

	.os-label__count,
	.os-label__area {
		font-size: 0.6rem;
		color: #4a3f30;
		background: rgba(255 255 255 / 0.75);
		padding: 0 4px;
		border-radius: 2px;
		white-space: nowrap;
	}

	.os-label--selected .os-label__name {
		outline: 2px solid var(--color-selection, #2563eb);
		outline-offset: 1px;
	}
</style>
