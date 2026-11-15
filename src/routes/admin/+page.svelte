<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let name = $state('');
	let leadEmail = $state('');
	let description = $state('');
	let error = $state('');
	let message = $state('');

	async function call(url: string, method: string, body: unknown, done = '') {
		error = '';
		message = '';
		const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!res.ok) {
			error = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'That didn’t work. Try again.';
			return false;
		}
		message = done;
		await invalidateAll();
		return true;
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (await call('/api/admin/committees', 'POST', { name, leadEmail, description }, `${name} created; an invitation went to ${leadEmail}.`)) name = leadEmail = description = '';
	}
</script>

<svelte:head>
	<title>Admin</title>
</svelte:head>

<div class="admin-page">
	<Masthead />
	<main class="admin-main">
		<h2 class="title">Admin</h2>
		<p class="note">For the Faith & Home team: who may start a committee, and committees for workshops and partners. Every committee is listed under <a href="/committees">Committees</a>.</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if message}<p class="message" role="status">{message}</p>{/if}

		<section class="section" aria-label="New committees">
			<h3 class="heading">New committees</h3>
			<label class="toggle">
				<input type="checkbox" checked={data.allowNew} onchange={(e) => call('/api/admin/settings', 'PUT', { allowNewCommittees: (e.target as HTMLInputElement).checked })} />
				Anyone who signs up can start a committee
			</label>
			<p class="note">Off: committees are by invitation only, created here by the team.</p>
		</section>

		<section class="section" aria-label="Committee for someone else">
			<h3 class="heading">A committee for someone else</h3>
			<form class="create" onsubmit={create}>
				<input class="text-input" aria-label="Committee name" placeholder="Committee name" bind:value={name} required />
				<input class="text-input" type="email" aria-label="First lead's email" placeholder="First lead's email" bind:value={leadEmail} required />
				<input class="text-input wide" aria-label="Description" placeholder="Description (optional)" maxlength="200" bind:value={description} />
				<button class="btn btn--primary" type="submit">Create and invite</button>
			</form>
			<p class="note">Creates the committee and emails its first lead an invitation.</p>
		</section>
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.admin-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.admin-main { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
	.title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0 0 0.3rem; }
	.note { font-size: 0.75rem; color: var(--fh-stone); }
	.section { margin-top: 1.5rem; }
	.heading { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--color-border); }
	.toggle { display: flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
	.create { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }
	.wide { flex-basis: 100%; }
	.text-input { padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.85rem; background: #fff; }
	.btn { padding: 0.35rem 0.75rem; border: 1px solid var(--color-border); border-radius: 3px; background: none; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.btn--primary { background: var(--fh-dusk); border-color: var(--fh-dusk); color: #fff; }
	.error { font-size: 0.8rem; color: var(--fh-terracotta); }
	.message { font-size: 0.8rem; }
</style>
