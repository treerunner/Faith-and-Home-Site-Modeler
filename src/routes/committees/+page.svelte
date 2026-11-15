<script lang="ts">
	import { goto } from '$app/navigation';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let isTeam = $derived((data.user as { isTeam?: boolean } | null)?.isTeam ?? false);

	let starting = $state(false);
	let name = $state('');
	let description = $state('');
	let error = $state('');

	// A new committee with you as its lead; its page is where you invite people
	async function start(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const res = await fetch('/api/committees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, description }) });
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.message ?? 'Could not start the committee.';
			return;
		}
		await goto(`/committees/${body.slug}`, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Committees</title>
</svelte:head>

<div class="committees-page">
	<Masthead />
	<main class="committees-main">
		<div class="header">
			<h2 class="title">Committees</h2>
			{#if data.canStart && !starting}
				<button class="btn btn--primary" onclick={() => (starting = true)}>Start a committee</button>
			{/if}
		</div>
		<p class="note">
			A committee's members work on its sites and plans together.
			{#if isTeam}As the Faith & Home team you see every committee.{/if}
		</p>

		{#if starting}
			<form class="start" onsubmit={start}>
				<label class="field-label" for="new-name">Name</label>
				<input id="new-name" class="text-input" placeholder="e.g. Grace Church building committee" bind:value={name} required />
				<label class="field-label" for="new-description">Description (optional)</label>
				<input id="new-description" class="text-input" placeholder="e.g. Grace UMC, Allentown: property committee" maxlength="200" bind:value={description} />
				<div class="actions">
					<button class="btn btn--primary" type="submit">Start</button>
					<button class="btn" type="button" onclick={() => (starting = false)}>Cancel</button>
				</div>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</form>
		{/if}

		{#if data.committees.length}
			<ul class="list" aria-label="Committees">
				{#each data.committees as c (c.id)}
					<li class="row">
						<div class="info">
							<a class="name" href="/committees/{c.slug}">{c.name}</a>
							{#if c.description}<span class="description">{c.description}</span>{/if}
						</div>
						<span class="meta">
							{#if c.isTeam}Team · {/if}{c.role === 'lead' ? 'Lead · ' : c.role === 'member' ? 'Member · ' : ''}{c.members} member{c.members === 1 ? '' : 's'} · {c.sites} site{c.sites === 1 ? '' : 's'}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="note">
				You're not in a committee yet.
				{#if data.canStart}Start one, or ask a committee lead to invite you.{:else}Ask a committee lead or the Faith & Home team to invite you.{/if}
			</p>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.committees-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.committees-main { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
	.header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
	.title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0; }
	.note { font-size: 0.8rem; color: var(--fh-stone); }
	.start { display: flex; flex-direction: column; gap: 0.3rem; max-width: 28rem; margin: 0.75rem 0 1rem; }
	.actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
	.field-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
	.list { list-style: none; margin: 0.75rem 0 0; padding: 0; border-top: 1px solid var(--color-border); }
	.row { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.3rem 1rem; padding: 0.6rem 0; border-bottom: 1px solid var(--color-border); }
	.info { display: flex; flex-direction: column; gap: 0.1rem; }
	.name { font-weight: 700; font-size: 0.95rem; color: var(--color-text); text-decoration: none; }
	.name:hover { text-decoration: underline; }
	.description { font-size: 0.8rem; }
	.meta { font-size: 0.75rem; color: var(--fh-stone); }
	.text-input { padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.85rem; background: #fff; }
	.btn { padding: 0.35rem 0.75rem; border: 1px solid var(--color-border); border-radius: 3px; background: none; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.btn--primary { background: var(--fh-dusk); border-color: var(--fh-dusk); color: #fff; }
	.error { font-size: 0.8rem; color: var(--fh-terracotta); }
</style>
