<script lang="ts">
	import PlanList from './PlanList.svelte';
	import type { Plan } from '../types';

	// Compare's label on each view: A or B and the plan's name, opening the same menu as the
	// breadcrumb's plan menu to choose another
	interface Props { side: 'A' | 'B'; plan: Plan; name: string; onchoose: (id: string) => void }
	let { side, plan, name, onchoose }: Props = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement | undefined = $state();

	function choose(id: string) {
		open = false;
		onchoose(id);
	}

	// composedPath is fixed at dispatch, so clicks on items that re-render away still count as inside
	function handleWindowClick(e: MouseEvent) {
		if (open && rootEl && !e.composedPath().includes(rootEl)) open = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.stopPropagation(); // closes the menu, not compare
			open = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker" bind:this={rootEl} onkeydown={handleKeyDown}>
	<button
		class="picker-btn"
		aria-label="Plan {side} ({name})"
		aria-haspopup="true"
		aria-expanded={open}
		title="Choose plan {side}"
		onclick={() => (open = !open)}
	>
		<span class="side">{side}</span>
		<span class="name">{name}</span>
		<span class="caret" aria-hidden="true">▾</span>
	</button>
	{#if open}
		<div class="menu" role="group" aria-label="Choose plan {side}">
			<PlanList current={plan.id} onchoose={choose} />
		</div>
	{/if}
</div>

<style>
	.picker {
		position: absolute;
		top: 0.5rem;
		left: 0.6rem;
		z-index: 6;
	}

	.picker-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		max-width: 18rem;
		padding: 0.15rem 0.45rem 0.15rem 0.2rem;
		border: 1px solid transparent;
		border-radius: 4px;
		background: rgba(247 247 242 / 0.9);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;
	}
	.picker-btn:hover,
	.picker-btn[aria-expanded='true'] { background: #ece8e0; border-color: var(--color-border); }

	.side {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: 3px;
		background: var(--color-text);
		color: var(--color-surface);
		font-size: 0.65rem;
		font-weight: 700;
	}
	.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.caret { font-size: 0.7rem; color: var(--fh-stone); }

	/* As the breadcrumb's plan menu */
	.menu {
		position: absolute;
		left: 0;
		top: calc(100% + 0.3rem);
		width: 16rem;
		background: var(--fh-linen);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
		padding: 0.25rem;
	}
</style>
