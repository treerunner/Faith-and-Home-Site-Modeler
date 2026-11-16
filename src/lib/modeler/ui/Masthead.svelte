<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll, goto } from '$app/navigation';

	// The account menu: sign in, or your committees, the team's admin page, and sign out
	let user = $derived(page.data.user as { email: string; name: string; isTeam: boolean; memberships: { committeeId: string; committeeName: string; committeeSlug: string }[] } | null | undefined);
	let open = $state(false);
	let rootEl: HTMLDivElement | undefined = $state();

	async function signOut() {
		await fetch('/api/auth/signout', { method: 'POST' });
		open = false;
		await invalidateAll();
		await goto('/modeler');
	}

	function onWindowClick(e: MouseEvent) {
		if (open && rootEl && !e.composedPath().includes(rootEl)) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} />

<div class="masthead">
	<div class="masthead__nav">
		<img class="masthead__logo" src="/fh-logo.svg" alt="Faith and Home" />
		<div class="masthead__right">
		<div class="account" bind:this={rootEl}>
			{#if user}
				<button class="account__btn" aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)}>{user.name || user.email} ▾</button>
				{#if open}
					<div class="account__menu" role="menu">
						<a role="menuitem" href="/modeler/sites" onclick={() => (open = false)}>Sites</a>
						<a role="menuitem" href="/committees" onclick={() => (open = false)}>Committees</a>
						{#each user.memberships as m (m.committeeId)}
							<a role="menuitem" class="account__committee" href="/committees/{m.committeeSlug}" onclick={() => (open = false)}>{m.committeeName}</a>
						{/each}
						{#if user.isTeam}<a role="menuitem" href="/admin" onclick={() => (open = false)}>Admin</a>{/if}
						<a role="menuitem" href="/account" onclick={() => (open = false)}>Your account</a>
						<button role="menuitem" onclick={signOut}>Sign out</button>
					</div>
				{/if}
			{:else}
				<!-- Signing in lands on your sites; from a site's page, back to that site -->
				<a class="account__btn" href={/^\/modeler\/(?!sites$)[^/]+/.test(page.url.pathname) ? `/signin?next=${encodeURIComponent(page.url.pathname)}` : '/signin'}>Sign in</a>
			{/if}
		</div>
		<button class="masthead__menu" aria-label="Menu">
			<svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<line x1="0" y1="2"  x2="28" y2="2"  stroke="currentColor" stroke-width="2.5"/>
				<line x1="4" y1="10" x2="28" y2="10" stroke="currentColor" stroke-width="2.5"/>
				<line x1="8" y1="18" x2="28" y2="18" stroke="currentColor" stroke-width="2.5"/>
			</svg>
		</button>
		</div>
	</div>

	<div class="masthead__body">
		<div class="masthead__col masthead__col--title">
			<p class="masthead__eyebrow">Faith-based Affordable Housing Pattern Tool</p>
			<h1 class="masthead__title">Find Your Pattern</h1>
		</div>

		<div class="masthead__col">
			<p class="masthead__lead">Tell us about your space and your community.</p>
			<p class="masthead__body-text">We will connect you with models, tools, and stories that fit your context.</p>
		</div>

		<div class="masthead__col">
			<p class="masthead__lead">Or <a class="masthead__link" href="/patterns">browse</a> our pattern library.</p>
			<p class="masthead__body-text">See how other congregations are asserting values, navigating change, and building in their communities.</p>
		</div>
	</div>
</div>

<style>
	.masthead {
		background: var(--color-surface);
		border-bottom: 1.5px solid var(--color-border);
		flex-shrink: 0;
	}

	.masthead__nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
	}

	.masthead__logo {
		height: 44px;
		width: auto;
		display: block;
	}

	.masthead__menu {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text);
		padding: 0.25rem;
		display: flex;
		align-items: center;
	}

	.masthead__menu:hover { opacity: 0.6; }

	.masthead__right { display: flex; align-items: center; gap: 0.9rem; }
	.account { position: relative; }
	.account__btn {
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		padding: 0.25rem 0.65rem;
		font: inherit;
		font-size: 0.78rem;
		color: var(--color-text);
		text-decoration: none;
		cursor: pointer;
	}
	.account__btn:hover { background: #ece8e0; }
	.account__menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.3rem);
		z-index: 20;
		min-width: 12rem;
		display: flex;
		flex-direction: column;
		padding: 0.25rem;
		background: var(--fh-linen);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
	}
	.account__menu a, .account__menu button {
		padding: 0.35rem 0.5rem;
		border: none;
		border-radius: 3px;
		background: none;
		font: inherit;
		font-size: 0.78rem;
		text-align: left;
		color: var(--color-text);
		text-decoration: none;
		cursor: pointer;
	}
	.account__menu a:hover, .account__menu button:hover { background: #ece8e0; }
	.account__committee { padding-left: 1rem !important; }

	.masthead__body {
		display: grid;
		grid-template-columns: 2fr 1.5fr 1.5fr;
		gap: 0;
		padding: 0.75rem 1.25rem 0.85rem;
		border-top: none;
	}

	.masthead__col {
		padding-right: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.masthead__col--title {
		border-right: 1px solid var(--color-border);
		padding-right: 2rem;
		margin-right: 0;
	}

	.masthead__col:not(.masthead__col--title) {
		padding-left: 1.5rem;
	}

	.masthead__col:last-child {
		border-left: 1px solid var(--color-border);
	}

	.masthead__eyebrow {
		font-size: 0.72rem;
		color: var(--color-text);
		margin: 0;
		font-weight: 500;
	}

	.masthead__title {
		font-family: var(--font-display);
		font-size: 3.4rem;
		font-weight: normal;
		line-height: 1;
		color: var(--color-text);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.masthead__lead {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
		line-height: 1.4;
	}

	.masthead__body-text {
		font-size: 0.75rem;
		color: var(--color-text);
		margin: 0;
		line-height: 1.5;
	}

	.masthead__link {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.masthead__link:hover { opacity: 0.7; }
</style>
