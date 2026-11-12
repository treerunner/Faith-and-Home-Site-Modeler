<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import { deleteSite, duplicateSite, editUrl, viewUrl } from '#lib/modeler/api';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmingId = $state('');
	let error = $state('');

	const names = $derived(new Map(data.sites.map((s) => [s.id, s.name || 'Untitled'])));
	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	async function duplicate(id: string) {
		try {
			const copy = await duplicateSite(id);
			await goto(editUrl(copy.name, copy.shortId));
		} catch (e) {
			console.error(e);
			error = 'Could not duplicate the site.';
		}
	}

	async function remove(id: string) {
		try {
			await deleteSite(id);
			confirmingId = '';
			await refreshAll();
		} catch (e) {
			console.error(e);
			error = 'Could not delete the site.';
		}
	}
</script>

<svelte:head>
	<title>Saved sites</title>
</svelte:head>

<div class="sites-page">
	<Masthead />
	<main class="sites-main">
		<div class="sites-header">
			<h2 class="sites-title">Saved sites</h2>
			<a class="btn btn--primary" href="/modeler">New site</a>
		</div>

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		{#if data.sites.length === 0}
			<p class="empty">No saved sites yet.</p>
		{:else}
			<ul class="site-list" aria-label="Saved sites">
				{#each data.sites as site (site.id)}
					<li class="site-row">
						<div class="site-info">
							<a class="site-name" href={editUrl(site.name, site.shortId)}>{site.name || 'Untitled'}</a>
							<span class="site-meta">
								Updated {dateFmt.format(new Date(site.updatedAt))}
								{#if site.duplicatedFrom}
									· Copy of {names.get(site.duplicatedFrom) ?? 'a deleted site'}
								{/if}
							</span>
						</div>
						<div class="site-actions">
							{#if confirmingId === site.id}
								<span class="confirm-text">Delete this site?</span>
								<button class="btn btn--danger" onclick={() => remove(site.id)}>Delete</button>
								<button class="btn" onclick={() => (confirmingId = '')}>Cancel</button>
							{:else}
								<a class="btn" href={editUrl(site.name, site.shortId)}>Open</a>
								<a class="btn" href={viewUrl(site.name, site.shortId)}>View</a>
								<button class="btn" onclick={() => duplicate(site.id)}>Duplicate</button>
								<button class="btn" onclick={() => (confirmingId = site.id)}>Delete</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.sites-page {
		height: 100%;
		overflow-y: auto;
		background: var(--color-surface);
	}

	.sites-main {
		max-width: 52rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
	}

	.sites-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.sites-title {
		font-family: var(--font-display);
		font-weight: normal;
		font-size: 1.8rem;
		margin: 0;
	}

	.site-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
	}

	.site-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.site-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.site-name {
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.site-name:hover { text-decoration: underline; }

	.site-meta, .confirm-text, .empty {
		font-size: 0.75rem;
		color: var(--fh-stone);
	}

	.site-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.btn {
		padding: 0.25rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.72rem;
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
		text-decoration: none;
	}

	.btn:hover { background: #ece8e0; }

	.btn--primary {
		background: var(--fh-dusk);
		border-color: var(--fh-dusk);
		color: #fff;
	}

	.btn--primary:hover { background: #5a70a6; }

	.btn--danger {
		background: var(--fh-terracotta);
		border-color: var(--fh-terracotta);
		color: #fff;
	}

	.btn--danger:hover { background: #a94e51; }

	.error {
		font-size: 0.8rem;
		color: var(--fh-terracotta);
	}
</style>
