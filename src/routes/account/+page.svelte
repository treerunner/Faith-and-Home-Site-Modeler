<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import type { PageProps } from './$types';

	// Your account: the name your committees see, and signing out
	let { data }: PageProps = $props();
	let me = $derived(data.user as { email: string; name: string; memberships: { committeeName: string; committeeSlug: string; role: string }[] });
	// Starts from the saved name; edits stay local until saved
	let name = $state(untrack(() => (data.user as { name: string } | null)?.name ?? ''));
	let saved = $state(false);
	let error = $state('');

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saved = false;
		error = '';
		const res = await fetch('/api/account', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
		if (!res.ok) {
			error = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'Could not save.';
			return;
		}
		saved = true;
		await invalidateAll();
	}

	async function signOut() {
		await fetch('/api/auth/signout', { method: 'POST' });
		await invalidateAll();
		await goto('/modeler');
	}
</script>

<svelte:head>
	<title>Your account</title>
</svelte:head>

<div class="account-page">
	<Masthead />
	<main class="account-main">
		<h2 class="title">Your account</h2>
		<form class="form" onsubmit={save}>
			<label class="field-label" for="account-name">Name</label>
			<input id="account-name" class="text-input" autocomplete="name" placeholder="How your committees see you" bind:value={name} oninput={() => (saved = false)} />
			<p class="note">Shown to your committees. Leave it empty to show your email.</p>
			<div class="actions">
				<button class="btn btn--primary" type="submit">Save</button>
				{#if saved}<span class="saved" role="status">Saved</span>{/if}
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
		</form>

		<section class="section" aria-label="Email">
			<h3 class="heading">Email</h3>
			<p class="value">{me.email}</p>
			<p class="note">You sign in with a link sent here; there's no password.</p>
		</section>

		<section class="section" aria-label="Committees">
			<h3 class="heading">Committees</h3>
			{#if me.memberships.length}
				<ul class="list">
					{#each me.memberships as m (m.committeeSlug)}
						<li><a href="/committees/{m.committeeSlug}">{m.committeeName}</a> <span class="note">{m.role === 'lead' ? 'Lead' : 'Member'}</span></li>
					{/each}
				</ul>
			{:else}
				<p class="note">None yet. <a href="/committees">Start or join one</a>.</p>
			{/if}
		</section>

		<button class="btn" onclick={signOut}>Sign out</button>
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.account-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.account-main { max-width: 30rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; display: flex; flex-direction: column; align-items: flex-start; gap: 1rem; }
	.title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0; }
	.form { display: flex; flex-direction: column; gap: 0.3rem; width: 100%; }
	.field-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
	.text-input { padding: 0.4rem 0.55rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.9rem; background: #fff; }
	.actions { display: flex; align-items: center; gap: 0.6rem; }
	.saved { font-size: 0.8rem; color: var(--fh-stone); }
	.section { width: 100%; }
	.heading { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--color-border); }
	.value { margin: 0; font-size: 0.9rem; }
	.note { margin: 0.2rem 0 0; font-size: 0.75rem; color: var(--fh-stone); }
	.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
	.list a { color: var(--color-text); }
	.btn { padding: 0.4rem 0.8rem; border: 1px solid var(--color-border); border-radius: 3px; background: none; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.btn--primary { background: var(--fh-dusk); border-color: var(--fh-dusk); color: #fff; }
	.error { font-size: 0.8rem; color: var(--fh-terracotta); }
</style>
