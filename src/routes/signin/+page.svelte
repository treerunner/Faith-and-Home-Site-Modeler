<script lang="ts">
	import { page } from '$app/state';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';

	// Sign in by email: we send a link that works once, for 15 minutes. No passwords.
	let email = $state('');
	let sent = $state(false);
	let busy = $state(false);
	let error = $state('');
	const next = page.url.searchParams.get('next');
	const expired = page.url.searchParams.has('expired');
	const inviteExpired = page.url.searchParams.get('invite') === 'expired';

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, next }) });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Could not send the link.');
			sent = true;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in</title>
</svelte:head>

<div class="signin-page">
	<Masthead />
	<main class="signin-main">
		<h2 class="signin-title">Sign in</h2>
		{#if expired}<p class="notice" role="status">That link has expired or was already used. Ask for a new one.</p>{/if}
		{#if inviteExpired}<p class="notice" role="status">That invitation has expired or was already used. Ask your committee lead for a new one.</p>{/if}
		{#if sent}
			<p class="sent" role="status">Check your email. We sent a sign-in link to <strong>{email}</strong>. It works once, for 15 minutes.</p>
			<button class="link-btn" onclick={() => (sent = false)}>Use a different address</button>
		{:else}
			<p class="intro">Enter your email and we'll send you a link to sign in. No password needed.</p>
			<form class="signin-form" onsubmit={submit}>
				<label class="field-label" for="signin-email">Email</label>
				<input id="signin-email" class="text-input" type="email" required autocomplete="email" bind:value={email} />
				<button class="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Sending' : 'Send sign-in link'}</button>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</form>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.signin-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.signin-main { max-width: 26rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
	.signin-title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0 0 0.5rem; }
	.intro, .sent, .notice { font-size: 0.85rem; line-height: 1.45; }
	.notice { padding: 0.5rem 0.7rem; border: 1px solid var(--color-border); border-radius: 4px; background: var(--fh-lantern-tint); }
	.signin-form { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.75rem; }
	.field-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
	.text-input { padding: 0.45rem 0.55rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.9rem; }
	.btn { margin-top: 0.4rem; padding: 0.45rem 0.8rem; border: 1px solid var(--fh-dusk); border-radius: 3px; background: var(--fh-dusk); color: #fff; font: inherit; font-size: 0.85rem; cursor: pointer; }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.link-btn { border: none; background: none; padding: 0; font: inherit; font-size: 0.8rem; color: var(--color-selection); text-decoration: underline; cursor: pointer; }
	.error { font-size: 0.8rem; color: var(--fh-terracotta); }
</style>
