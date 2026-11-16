<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';

	// The link in an invitation email opens this page: it says what the invitation is for, and
	// pressing the button accepts it and signs in. Mail scanners don't press buttons, so they
	// can't use the invitation up.
	const token = page.url.searchParams.get('token') ?? '';
	let invitation = $state<{ committeeName: string; email: string } | null>(null);
	let busy = $state(false);
	let error = $state('');

	onMount(async () => {
		const res = await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`);
		const body = await res.json().catch(() => null);
		if (res.ok) invitation = body;
		else error = body?.message ?? 'That invitation has expired or was already used.';
	});

	async function accept() {
		busy = true;
		const res = await fetch('/api/auth/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.message ?? 'That didn’t work. Ask your committee lead for a new invitation.';
			busy = false;
			return;
		}
		await goto(`/committees/${body.slug}`, { invalidateAll: true, replaceState: true });
	}
</script>

<svelte:head>
	<title>Invitation</title>
</svelte:head>

<div class="auth-page">
	<Masthead />
	<main class="auth-main">
		<h2 class="auth-title">Invitation</h2>
		{#if error}
			<p class="notice" role="alert">{error}</p>
		{:else if invitation}
			<p class="intro">You're invited to join <strong>{invitation.committeeName}</strong>, to work on its sites and plans together. You'll be signed in as {invitation.email}.</p>
			<button class="btn" onclick={accept} disabled={busy}>{busy ? 'Joining' : 'Accept and sign in'}</button>
		{:else}
			<p class="intro">Checking the invitation…</p>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.auth-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.auth-main { max-width: 28rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; }
	.auth-title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0; }
	.intro, .notice { font-size: 0.85rem; line-height: 1.45; margin: 0; }
	.notice { padding: 0.5rem 0.7rem; border: 1px solid var(--color-border); border-radius: 4px; background: var(--fh-lantern-tint); }
	.btn { padding: 0.45rem 0.9rem; border: 1px solid var(--fh-dusk); border-radius: 3px; background: var(--fh-dusk); color: #fff; font: inherit; font-size: 0.85rem; cursor: pointer; }
	.btn:disabled { opacity: 0.6; cursor: default; }
</style>
