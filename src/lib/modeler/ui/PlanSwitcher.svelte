<script lang="ts">
	import { store } from '../store.svelte';
	import { syncUrl } from './SiteBar.svelte';
	import PlanList from './PlanList.svelte';
	import Caret from './Caret.svelte';

	let open = $state(false);
	let confirmingDelete = $state(false);
	let renaming = $state(false); // the plan's name is a text box in place of the menu button
	let rootEl: HTMLDivElement | undefined = $state();

	function close() {
		open = false;
		confirmingDelete = false;
	}

	function choose(id: string) {
		store.switchPlan(id);
		syncUrl();
		close();
	}

	function newPlan() {
		store.newPlan();
		syncUrl();
		rename();
	}

	function duplicate() {
		store.duplicatePlan();
		syncUrl();
		rename();
	}

	// A new or copied plan opens with its name ready to type over
	function rename() {
		close();
		renaming = true;
	}

	function focusAndSelect(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

	function handleRenameKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			(e.target as HTMLInputElement).blur();
		}
	}

	// Side by side with existing conditions (or, from the site view, the first plan)
	function compare() {
		close();
		store.startCompare();
		syncUrl();
	}

	function remove() {
		store.deletePlan(store.plan.id);
		syncUrl();
		close();
	}

	// composedPath is fixed at dispatch, so clicks on buttons that re-render away still count as inside
	function handleWindowClick(e: MouseEvent) {
		if (open && rootEl && !e.composedPath().includes(rootEl)) close();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="plan-switcher" bind:this={rootEl} onkeydown={handleKeyDown}>
	<div class="plan-row">
		<!-- The last breadcrumb: existing conditions (the site view) or a plan, by name; it opens the plan menu -->
		{#if renaming}
			<input
				class="plan-name-input"
				type="text"
				aria-label="Plan name"
				placeholder="Untitled plan"
				value={store.plan.name}
				use:focusAndSelect
				onkeydown={handleRenameKey}
				onblur={() => (renaming = false)}
				oninput={(e) => store.renamePlan((e.target as HTMLInputElement).value)}
			/>
		{:else}
			<button
				class="plan-menu-btn"
				aria-label="Choose plan ({store.plan.name || 'Untitled plan'})"
				aria-haspopup="true"
				aria-expanded={open}
				title="Choose a plan"
				onclick={() => (open ? close() : (open = true))}
			>
				<span class="plan-name">{store.plan.name || 'Untitled plan'}</span>
				<Caret />
			</button>
		{/if}
	</div>

	{#if open}
		<div class="plan-menu">
			<PlanList current={store.plan.id} onchoose={choose} />

			{#if store.site.plans.length}
				<div class="plan-actions">
					<button class="menu-btn" onclick={compare} title="See two plans side by side">Compare</button>
				</div>
			{/if}

			{#if !store.readOnly}
				<div class="plan-actions">
					{#if confirmingDelete}
						<span class="confirm-text">Delete "{store.plan.name || 'Untitled plan'}"?</span>
						<div class="action-pair">
							<button class="menu-btn menu-btn--danger" onclick={remove}>Delete</button>
							<button class="menu-btn" onclick={() => (confirmingDelete = false)}>Cancel</button>
						</div>
					{:else}
						<button class="menu-btn" onclick={newPlan} title="Start from existing conditions">New plan</button>
						{#if !store.onSite}
							<button class="menu-btn" onclick={duplicate} title="Copy this plan">Duplicate</button>
							<button class="menu-btn" onclick={rename}>Rename</button>
							<button class="menu-btn menu-btn--quiet" onclick={() => (confirmingDelete = true)}>Delete plan</button>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.plan-switcher {
		position: relative;
		min-width: 0;
	}

	.plan-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}


	.plan-name-input {
		field-sizing: content; /* as wide as the name, like the breadcrumb's other parts */
		min-width: 6ch;
		max-width: 24rem;
		border: none;
		border-bottom: 1px solid transparent;
		background: transparent;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		padding: 0;
		outline: none;
		caret-color: var(--color-selection);
	}


	.plan-name-input:focus { border-bottom-color: var(--color-selection); }

	.plan-menu-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: -0.15rem -0.4rem;
		padding: 0.15rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 3px;
		background: none;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;
		max-width: 24rem;
	}

	.plan-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.plan-menu-btn:hover,
	.plan-menu-btn[aria-expanded='true'] { background: #ece8e0; border-color: var(--color-border); }


	.plan-menu {
		position: absolute;
		left: 0;
		width: 16rem;
		top: calc(100% + 0.3rem);
		z-index: 30;
		background: var(--fh-linen);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
		padding: 0.25rem;
	}

	.plan-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.25rem;
		padding-top: 0.3rem;
		border-top: 1px solid var(--color-border);
	}

	.action-pair {
		display: flex;
		gap: 0.25rem;
		width: 100%;
	}

	.confirm-text {
		width: 100%;
		font-size: 0.68rem;
		color: var(--color-text);
		padding: 0 0.2rem;
	}

	.menu-btn {
		flex: 1;
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.68rem;
		color: var(--color-text);
		cursor: pointer;
		white-space: nowrap;
	}

	.menu-btn:hover { background: #ece8e0; }

	.menu-btn--quiet {
		flex-basis: 100%;
		border-color: transparent;
		color: #9a3a2a;
	}

	.menu-btn--quiet:hover { background: #fdf0ee; }

	.menu-btn--danger {
		border-color: #c8a090;
		color: #9a3a2a;
	}

	.menu-btn--danger:hover { background: #fdf0ee; }
</style>
