<script lang="ts">
	import { store } from '../store.svelte';
	import { syncUrl } from './SiteBar.svelte';

	let open = $state(false);
	let confirmingDelete = $state(false);
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
		close();
	}

	function duplicate() {
		store.duplicatePlan();
		syncUrl();
		close();
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
		<span class="plan-eyebrow">Plan</span>
		<input
			class="plan-name-input"
			type="text"
			aria-label="Plan name"
			placeholder="Untitled plan"
			value={store.plan.name}
			disabled={store.readOnly}
			oninput={(e) => store.renamePlan((e.target as HTMLInputElement).value)}
		/>
		<button
			class="plan-menu-btn"
			aria-label="Choose plan"
			aria-haspopup="true"
			aria-expanded={open}
			onclick={() => (open ? close() : (open = true))}
		>
			<span class="plan-count">{store.site.plans.length}</span>
			<span aria-hidden="true">▾</span>
		</button>
	</div>

	{#if open}
		<div class="plan-menu">
			<ul class="plan-list" aria-label="Plans">
				{#each store.site.plans as p (p.id)}
					<li>
						<button
							class="plan-item"
							class:plan-item--active={p.id === store.plan.id}
							aria-current={p.id === store.plan.id ? 'true' : undefined}
							onclick={() => choose(p.id)}
						>{p.name || 'Untitled plan'}</button>
					</li>
				{/each}
			</ul>

			{#if !store.readOnly}
				<div class="plan-actions">
					{#if confirmingDelete}
						<span class="confirm-text">Delete "{store.plan.name || 'Untitled plan'}"?</span>
						<div class="action-pair">
							<button class="menu-btn menu-btn--danger" onclick={remove}>Delete</button>
							<button class="menu-btn" onclick={() => (confirmingDelete = false)}>Cancel</button>
						</div>
					{:else}
						<button class="menu-btn" onclick={newPlan} title="Start from the existing buildings">New plan</button>
						<button class="menu-btn" onclick={duplicate} title="Copy this plan">Duplicate</button>
						{#if store.site.plans.length > 1}
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
		padding: 0.35rem 0.6rem 0.4rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.plan-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.plan-eyebrow {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fh-stone);
	}

	.plan-name-input {
		flex: 1;
		min-width: 0;
		border: none;
		border-bottom: 1px solid transparent;
		background: transparent;
		font-size: 0.75rem;
		color: var(--color-text);
		padding: 0;
		outline: none;
		caret-color: var(--color-selection);
	}

	.plan-name-input:focus { border-bottom-color: var(--color-selection); }
	.plan-name-input:disabled { color: var(--color-text); opacity: 1; }

	.plan-menu-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.65rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.plan-menu-btn:hover,
	.plan-menu-btn[aria-expanded='true'] { background: #ece8e0; }

	.plan-count { font-variant-numeric: tabular-nums; }

	.plan-menu {
		position: absolute;
		left: 0.6rem;
		right: 0.6rem;
		top: calc(100% - 0.15rem);
		z-index: 10;
		background: #fff;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
		padding: 0.25rem;
	}

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

	.plan-item--active {
		font-weight: 600;
		background: var(--fh-dusk-tint);
	}

	.plan-item--active:hover { background: var(--fh-dusk-tint); }

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
