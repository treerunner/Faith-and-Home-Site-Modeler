<script lang="ts">
	import { BUILDING_TYPE_LABELS, DEVELOPMENT_TYPE_LABELS } from '../modeler/metrics';
	import { BUILDING_TYPES, DEVELOPMENT_TYPES, SITE_TYPES, type Pattern } from './catalog';
	import { covers, patternForCell, SITE_TYPE_LABELS } from './match';

	// The pattern matrix as three grids, one per site type: building types across, development
	// types down. With `pattern`, a compact diagram of the cells it covers; otherwise the full
	// coverage view, each cell naming its pattern.
	let { patterns = [], pattern }: { patterns?: Pattern[]; pattern?: Pattern } = $props();
</script>

<div class="matrix" class:matrix--compact={pattern}>
	{#each SITE_TYPES as siteType (siteType)}
		<table class="grid" aria-label="{SITE_TYPE_LABELS[siteType]} sites">
			<caption>{SITE_TYPE_LABELS[siteType]}</caption>
			<thead>
				<tr>
					<td></td>
					{#each BUILDING_TYPES as b (b)}<th scope="col">{BUILDING_TYPE_LABELS[b]}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each DEVELOPMENT_TYPES as developmentType (developmentType)}
					<tr>
						<th scope="row">{DEVELOPMENT_TYPE_LABELS[developmentType]}</th>
						{#each BUILDING_TYPES as buildingType (buildingType)}
							{@const cell = { buildingType, siteType, developmentType }}
							{#if pattern}
								{@const on = covers(pattern, cell)}
								<td class="cell" class:cell--on={on} aria-label={on ? 'Covered' : 'Not covered'}></td>
							{:else}
								{@const owner = patternForCell(patterns, cell)}
								<td class="cell" class:cell--on={owner}>
									{#if owner}<a href="/patterns/{owner.slug}">{owner.name}</a>{/if}
								</td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/each}
</div>

<style>
	.matrix {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.matrix--compact {
		flex-direction: row;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.grid {
		border-collapse: collapse;
		font-size: 0.66rem;
	}

	caption {
		text-align: left;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.62rem;
		padding-bottom: 0.3rem;
	}

	th {
		font-weight: 600;
		color: var(--fh-stone);
		text-align: left;
		padding: 0.15rem 0.4rem 0.15rem 0;
		white-space: nowrap;
	}

	thead th { text-align: center; padding: 0 0.2rem 0.2rem; }

	.cell {
		border: 1px solid var(--color-border);
		background: #fff;
		width: 9rem;
		height: 2.6rem;
		padding: 0.25rem 0.35rem;
		vertical-align: top;
		line-height: 1.3;
	}

	.cell--on { background: var(--fh-lantern-tint); }

	.cell a {
		color: var(--color-text);
		text-decoration: none;
	}

	.cell a:hover { text-decoration: underline; }

	.matrix--compact .cell {
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
	}

	.matrix--compact .cell--on { background: var(--fh-lantern); }
	.matrix--compact thead th { writing-mode: vertical-rl; transform: rotate(180deg); text-align: left; }
</style>
