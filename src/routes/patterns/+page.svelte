<script lang="ts">
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Pattern library</title>
</svelte:head>

<div class="patterns-page">
	<Masthead />
	<main class="patterns-main">
		<div class="patterns-header">
			<h2 class="patterns-title">Pattern library</h2>
			<div class="patterns-links">
				<a class="btn" href="/patterns/matrix">Pattern matrix</a>
				<a class="btn" href="/modeler">Model your site</a>
			</div>
		</div>
		<ul class="pattern-cards" aria-label="Patterns">
			{#each data.patterns as p (p.slug)}
				<li class="pattern-card">
					<a class="pattern-card__name" href="/patterns/{p.slug}">{p.name}</a>
					<p class="pattern-card__summary">{p.summary}</p>
					{#if p.placeholder}<span class="placeholder-tag">Placeholder</span>{/if}
				</li>
			{/each}
		</ul>
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.patterns-page {
		height: 100%;
		overflow-y: auto;
		background: var(--color-surface);
	}

	.patterns-main {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
	}

	.patterns-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.patterns-title {
		font-family: var(--font-display);
		font-weight: normal;
		font-size: 1.8rem;
		margin: 0;
	}

	.pattern-cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 1rem;
	}

	.pattern-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.9rem;
		background: #fff;
		border: 1px solid var(--color-border);
		border-radius: 4px;
	}

	.pattern-card__name {
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.pattern-card__name:hover { text-decoration: underline; }
	.pattern-card__summary { margin: 0; font-size: 0.78rem; line-height: 1.45; color: var(--color-text); }

	.patterns-links { display: flex; gap: 0.4rem; }

	.placeholder-tag {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #9a5a10;
	}

	.btn {
		padding: 0.25rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		font-size: 0.72rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.btn:hover { background: #ece8e0; }
</style>
