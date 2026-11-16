<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';

	// The link in a sign-in email opens this page; pressing the button signs in. Mail scanners
	// that open links to check them don't press buttons, so they can't use the link up.
	const token = page.url.searchParams.get('token') ?? '';
	let busy = $state(false);
	let error = $state('');

	async function signIn() {
		busy = true;
		error = '';
		const res = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.message ?? 'That didn’t work. Ask for a new link.';
			busy = false;
			return;
		}
		await goto(body.next, { invalidateAll: true, replaceState: true });
	}
</script>

<svelte:head>
	<title>Sign in</title>
</svelte:head>

<div class="auth-page">
	<Masthead />
	<main class="auth-main">
		<h2 class="auth-title">Sign in</h2>
		{#if error}
			<p class="notice" role="alert">{error}</p>
			<a class="btn" href="/signin">Get a new link</a>
		{:else}
			<p class="intro">Continue to sign in to the Faith & Home site modeler.</p>
			<button class="btn btn--primary" onclick={signIn} disabled={busy || !token}>{busy ? 'Signing in' : 'Sign in'}</button>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.auth-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.auth-main { max-width: 26rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; }
	.auth-title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0; }
	.intro, .notice { font-size: 0.85rem; line-height: 1.45; margin: 0; }
	.notice { padding: 0.5rem 0.7rem; border: 1px solid var(--color-border); border-radius: 4px; background: var(--fh-lantern-tint); }
	.btn { padding: 0.45rem 0.9rem; border: 1px solid var(--color-border); border-radius: 3px; background: none; font: inherit; font-size: 0.85rem; color: var(--color-text); text-decoration: none; cursor: pointer; }
	.btn--primary { background: var(--fh-dusk); border-color: var(--fh-dusk); color: #fff; }
	.btn:disabled { opacity: 0.6; cursor: default; }
</style>
