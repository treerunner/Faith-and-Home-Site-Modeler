<script lang="ts">
	import { store } from '../store.svelte';
	import type { ContextSource } from '../types';

	// Required by the data licenses (OpenStreetMap: ODbL) wherever their data is shown.
	const CREDITS: Record<ContextSource, string> = {
		osm: '© OpenStreetMap contributors',
		'pasda-lehigh': 'Parcels: Lehigh County via PASDA',
	};

	let credits = $derived((store.site.context.sources ?? []).map((s) => CREDITS[s]));
</script>

{#if credits.length}
	<p class="attribution">{credits.join(' · ')}</p>
{/if}

<style>
	.attribution {
		position: absolute;
		left: 0.5rem;
		bottom: 2.4rem; /* above the view toolbar */
		margin: 0;
		font-size: 0.6rem;
		color: var(--fh-stone);
		background: rgba(247 247 242 / 0.85);
		padding: 0.1rem 0.35rem;
		border-radius: 2px;
		pointer-events: none;
	}
</style>
