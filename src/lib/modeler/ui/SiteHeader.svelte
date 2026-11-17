<script lang="ts">
	import { page } from '$app/state';
	import { store } from '../store.svelte';
	import PlanSwitcher from './PlanSwitcher.svelte';
	import { syncUrl } from './SiteBar.svelte';

	// Where you are, above the canvas: Committee › Site › Plan ▾. The site's name is edited here
	// on the site view; from a plan it leads back to the site view. The plan part is the plan menu.
	type User = { isTeam: boolean; memberships: { committeeId: string }[] } | null | undefined;
	let user = $derived(page.data.user as User);
	let committee = $derived(store.rights.committee);
	// Members and the team can open the committee's page; others just read its name
	let committeeLink = $derived(!!committee && !!user && (user.isTeam || user.memberships.some((m) => m.committeeId === committee!.id)));

	function toSite() {
		store.switchPlan(store.site.existing.id);
		syncUrl();
	}
</script>

<nav class="site-header" aria-label="Where you are">
	<span class="crumb crumb--committee">
		{#if !store.isPersisted}
			Unsaved sketch
		{:else if committee && committeeLink}
			<a href="/committees/{committee.slug}">{committee.name}</a>
		{:else if committee}
			{committee.name}
		{/if}
	</span>
	<span class="sep" aria-hidden="true">›</span>
	<span class="crumb crumb--site">
		{#if store.onSite && !store.readOnly}
			<input
				class="site-name-input"
				type="text"
				aria-label="Site name"
				placeholder="Untitled site"
				value={store.site.name}
				oninput={(e) => store.updateSiteName((e.target as HTMLInputElement).value)}
			/>
		{:else if !store.onSite}
			<button class="site-link" onclick={toSite} title="Go to the site's existing conditions">{store.site.name || 'Untitled site'}</button>
		{:else}
			{store.site.name || 'Untitled site'}
		{/if}
	</span>
	<span class="sep" aria-hidden="true">›</span>
	<PlanSwitcher />
</nav>

<style>
	.site-header {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		padding: 0.45rem 1.25rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.85rem;
		flex-shrink: 0;
	}

	.crumb { white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.crumb--committee { color: var(--fh-stone); }
	.crumb--committee a { color: inherit; text-decoration: none; }
	.crumb--committee a:hover { color: var(--color-text); text-decoration: underline; }
	.crumb--site { font-weight: 600; overflow: visible; }
	.sep { color: var(--fh-stone); }

	.site-name-input {
		field-sizing: content; /* as wide as the name */
		min-width: 6ch;
		max-width: 24rem;
		border: none;
		border-bottom: 1px solid transparent;
		background: transparent;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--color-text);
		outline: none;
		caret-color: var(--color-selection);
	}
	.site-name-input:hover { border-bottom-color: var(--color-border); }
	.site-name-input:focus { border-bottom-color: var(--color-selection); }

	.site-link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;
	}
	.site-link:hover { text-decoration: underline; }
</style>
