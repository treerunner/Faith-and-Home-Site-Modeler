<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AXIS_LABELS, cellLabel, isComplete, type PlanPattern } from '../../patterns/match';

	// A plan's place in the pattern matrix and the pattern written for it (the analysis and
	// compare). `children` follows the pattern, e.g. the analysis's "use as example".
	interface Props { found: PlanPattern; children?: Snippet }
	let { found, children }: Props = $props();
	let { cell, pattern, variant, nearest } = $derived(found);
</script>

{#if isComplete(cell)}
	<p class="pattern-cell">{cellLabel(cell)}</p>
	{#if pattern}
		<div class="pattern-item">
			<a class="pattern-name" href="/patterns/{pattern.slug}" target="_blank" rel="noopener">{pattern.name}</a>
			<p class="pattern-summary">{pattern.summary}</p>
			{#if variant}
				<p class="pattern-variant"><span class="reason-label">Variant</span> <strong>{variant.name}</strong>. {variant.summary}</p>
			{/if}
			{@render children?.()}
		</div>
	{:else}
		<p class="pattern-summary pattern-empty">No pattern written for this combination yet.</p>
		{#if nearest}
			<p class="pattern-reason">
				<span class="reason-label">Closest written pattern</span>
				<a class="pattern-name" href="/patterns/{nearest.pattern.slug}" target="_blank" rel="noopener">{nearest.pattern.name}</a>
				(differs in {nearest.differs.map((a) => AXIS_LABELS[a]).join(' and ')})
			</p>
		{/if}
	{/if}
{:else if !cell.buildingType}
	<p class="pattern-summary pattern-empty">Add buildings to place the site in the pattern matrix.</p>
{:else}
	<p class="pattern-summary pattern-empty">Choose a site type to place the site in the pattern matrix.</p>
{/if}
