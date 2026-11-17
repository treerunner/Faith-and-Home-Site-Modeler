<script lang="ts">
	import { store } from '../store.svelte';

	// Existing conditions, then the plans under them: the plan menu's list, and compare's pickers.
	// `current` is marked; choosing one calls `onchoose` with its id.
	interface Props { current: string; onchoose: (id: string) => void }
	let { current, onchoose }: Props = $props();
</script>

<button
	class="plan-item plan-item--site"
	class:plan-item--active={current === store.site.existing.id}
	aria-current={current === store.site.existing.id ? 'true' : undefined}
	onclick={() => onchoose(store.site.existing.id)}
>{store.site.existing.name}<span class="plan-item-tag">Site</span></button>
{#if store.site.plans.length}
	<ul class="plan-list" aria-label="Plans">
		{#each store.site.plans as p (p.id)}
			<li>
				<button
					class="plan-item"
					class:plan-item--active={p.id === current}
					aria-current={p.id === current ? 'true' : undefined}
					onclick={() => onchoose(p.id)}
				>{p.name || 'Untitled plan'}</button>
			</li>
		{/each}
	</ul>
{:else}
	<p class="plan-empty">No plans yet. A plan starts from existing conditions.</p>
{/if}

<style>
	.plan-list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 12rem;
		overflow-y: auto;
	}

	.plan-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.3rem 0.4rem;
		border: none;
		border-radius: 3px;
		background: none;
		font-size: 0.72rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.plan-item:hover { background: var(--fh-linen); }

	.plan-item--site {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.2rem;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid var(--color-border);
		border-radius: 3px 3px 0 0;
	}

	/* Plans hang under the site */
	.plan-list .plan-item { padding-left: 0.9rem; }

	.plan-item-tag {
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fh-stone);
	}

	.plan-empty {
		margin: 0.2rem 0.4rem 0.1rem;
		font-size: 0.68rem;
		color: var(--fh-stone);
	}

	.plan-item--active {
		font-weight: 600;
		background: var(--fh-dusk-tint);
	}

	.plan-item--active:hover { background: var(--fh-dusk-tint); }
</style>
