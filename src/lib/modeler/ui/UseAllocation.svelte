<script lang="ts">
	import { USE_COLORS } from '../colors';
	import { fmtSqft } from '../units';
	import type { Use } from '../types';

	// Floor area by use: a bar, then a row per use, largest first
	interface Props { areas: Partial<Record<Use, number>>; label?: string }
	let { areas, label }: Props = $props();

	const USE_LABELS: Record<Use, string> = {
		worship: 'Worship', fellowship: 'Fellowship', education: 'Education',
		office: 'Office', housing: 'Housing', community: 'Community',
		daycare: 'Daycare', kitchen: 'Kitchen', social_services: 'Social services', other: 'Other',
	};

	let entries = $derived((Object.entries(areas) as [Use, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]));
	let total = $derived(entries.reduce((a, [, v]) => a + v, 0));
	const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) + '%' : '—');
</script>

{#if label}<p class="alloc-label">{label}</p>{/if}
{#if entries.length}
	<div class="alloc-bar" aria-hidden="true">
		{#each entries as [use, area] (use)}
			<div class="alloc-seg" style="width:{total > 0 ? (area / total) * 100 : 0}%;background:{USE_COLORS[use]}"></div>
		{/each}
	</div>
	<div class="alloc-rows">
		{#each entries as [use, area] (use)}
			<div class="alloc-row">
				<span class="alloc-dot" style="background:{USE_COLORS[use]}"></span>
				<span class="alloc-name">{USE_LABELS[use]}</span>
				<span class="alloc-area">{fmtSqft(area)}</span>
				<span class="alloc-pct">{pct(area)}</span>
			</div>
		{/each}
	</div>
{:else}
	<p class="pattern-summary pattern-empty">No uses set.</p>
{/if}
