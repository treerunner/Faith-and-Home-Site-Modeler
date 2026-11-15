<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import { deleteSite, duplicateSite, planUrl, siteUrl } from '#lib/modeler/api';
	import { DEVELOPMENT_TYPE_LABELS } from '#lib/modeler/metrics';
	import { DEFAULT_PLAN_NAME } from '#lib/modeler/serialize';
	import type { DevelopmentType } from '#lib/modeler/types';

	// The pattern book's colors for what a plan does: green reuse, orange new, both for both
	const DEV_COLOR: Partial<Record<DevelopmentType, string>> = {
		reuse: 'var(--color-reuse)',
		new: 'var(--color-new)',
		reuse_new: 'linear-gradient(to right, var(--color-reuse) 50%, var(--color-new) 50%)',
	};
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmingId = $state('');
	let error = $state('');

	const names = $derived(new Map(data.sites.map((s) => [s.id, s.name || 'Untitled'])));
	// Sites under their committees, most recently updated first
	const groups = $derived.by(() => {
		const out = new Map<string, { id: string | null; slug: string; name: string; sites: typeof data.sites }>();
		for (const s of data.sites) {
			const key = s.committee?.id ?? '';
			if (!out.has(key)) out.set(key, { id: s.committee?.id ?? null, slug: s.committee?.slug ?? '', name: s.committee?.name ?? 'No committee', sites: [] });
			out.get(key)!.sites.push(s);
		}
		return [...out.values()];
	});
	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	async function duplicate(id: string) {
		try {
			const copy = await duplicateSite(id);
			await goto(siteUrl(copy.slug));
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

		{#if !data.user}
			<p class="empty"><a href="/signin?next=/modeler/sites">Sign in</a> to see your committees' sites. You can <a href="/modeler">try the modeler</a> without an account.</p>
		{:else if data.sites.length === 0}
			<p class="empty">No saved sites yet. Sites you save go to your committee, where its members can work on them with you.</p>
		{:else}
			{#each groups as g (g.id ?? '')}
			<section class="committee-group" aria-label={g.name}>
			<h3 class="committee-heading">
				{#if g.id}<a href="/committees/{g.slug}">{g.name}</a>{:else}{g.name}{/if}
			</h3>
			<ul class="site-list" aria-label="Saved sites">
				{#each g.sites as site (site.id)}
					{@const name = site.name || 'Untitled'}
					<li class="site-card">
						<div class="site-head">
							<div class="site-info">
								<a class="site-name" href={siteUrl(site.slug)}>{name}</a>
								<span class="site-meta">
									Updated {dateFmt.format(new Date(site.updatedAt))}
									{#if site.duplicatedFrom}
										· Copy of {names.get(site.duplicatedFrom) ?? 'a deleted site'}
									{/if}
								</span>
							</div>
							<div class="site-actions">
								{#if confirmingId === site.id}
									<span class="confirm-text">Delete this site and its plans?</span>
									<button class="btn btn--danger" onclick={() => remove(site.id)}>Delete</button>
									<button class="btn" onclick={() => (confirmingId = '')}>Cancel</button>
								{:else}
									<button class="btn" onclick={() => duplicate(site.id)} title="Copy the site with all its plans">Duplicate</button>
									{#if site.canDelete}<button class="btn" onclick={() => (confirmingId = site.id)}>Delete</button>{/if}
								{/if}
							</div>
						</div>
						<!-- Existing conditions, then the plans that start from them -->
						<ul class="plan-tree" aria-label="Plans in {name}">
							<li class="plan-row plan-row--site">
								<a class="plan-name" href={siteUrl(site.slug)}>{DEFAULT_PLAN_NAME}</a>
								<span class="plan-tag">Site</span>
								<a class="plan-link" href={planUrl(site.slug, '', true)} aria-label="View {name}, {DEFAULT_PLAN_NAME}">View</a>
							</li>
							{#each site.plans as plan (plan.slug)}
								{@const planName = plan.name || 'Untitled plan'}
								<li class="plan-row">
									<a class="plan-name" href={planUrl(site.slug, plan.slug)}>{planName}</a>
									{#if plan.developmentType}
										<span class="dev-tag" style={DEV_COLOR[plan.developmentType] ? `background:${DEV_COLOR[plan.developmentType]}` : ''}>
											{DEVELOPMENT_TYPE_LABELS[plan.developmentType]}
										</span>
									{/if}
									<a class="plan-link" href={planUrl(site.slug, plan.slug, true)} aria-label="View {name}, {planName}">View</a>
								</li>
							{:else}
								<li class="plan-row plan-row--empty">No plans yet</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
			</section>
			{/each}
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

	.committee-group { margin-top: 1.25rem; }
	.committee-heading {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.committee-heading a { color: var(--color-text); text-decoration: none; }
	.committee-heading a:hover { text-decoration: underline; }

	.site-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* One site and its plans, held together */
	.site-card {
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--fh-linen);
		padding: 0.65rem 0.8rem 0.5rem;
	}

	.site-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	.site-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.site-name {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.site-name:hover { text-decoration: underline; }

	.plan-tree {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
	}

	.plan-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0 0.3rem 1rem;
		font-size: 0.78rem;
		border-bottom: 1px solid #ebe8e1;
	}

	.plan-row:last-child { border-bottom: none; }

	/* Existing conditions head the list; plans hang under them */
	.plan-row--site { padding-left: 0; }
	.plan-row--site .plan-name { font-weight: 600; }
	.plan-row--empty { color: var(--fh-stone); font-style: italic; }

	.plan-name {
		color: var(--color-text);
		text-decoration: none;
	}

	.plan-name:hover { text-decoration: underline; }

	.plan-tag {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fh-stone);
	}

	.dev-tag {
		font-size: 0.65rem;
		padding: 0.05rem 0.4rem;
		border-radius: 3px;
		background: var(--fh-stone-tint);
		color: var(--fh-black);
	}

	.plan-link {
		margin-left: auto;
		font-size: 0.72rem;
		color: var(--color-text);
		text-decoration: underline;
		text-decoration-color: var(--color-border);
		text-underline-offset: 2px;
	}

	.plan-link:hover { text-decoration-color: currentColor; }

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
