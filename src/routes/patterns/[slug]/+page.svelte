<script lang="ts">
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import MatrixGrid from '#lib/patterns/MatrixGrid.svelte';
	import { conditionText } from '#lib/patterns/match';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let p = $derived(data.pattern);
</script>

<svelte:head>
	<title>{p.name}</title>
</svelte:head>

<div class="pattern-page">
	<Masthead />
	<main class="pattern-main">
		<a class="back" href="/patterns">Pattern library</a>
		{#if p.placeholder}
			<p class="placeholder-banner" role="note">Placeholder pattern. The team will replace this content.</p>
		{/if}
		<h2 class="pattern-title">{p.name}</h2>
		<p class="pattern-summary">{p.summary}</p>
		<section class="pattern-section" aria-label="Where it sits in the matrix">
			<h3 class="section-heading">In the matrix</h3>
			<MatrixGrid pattern={p} />
		</section>
		{#each p.sections as section (section.heading)}
			<section class="pattern-section">
				<h3 class="section-heading">{section.heading}</h3>
				<p>{section.text}</p>
			</section>
		{/each}
		{#if p.variants?.length}
			<section class="pattern-section" aria-label="Variants">
				<h3 class="section-heading">Variants</h3>
				{#each p.variants as v (v.key)}
					<div class="variant">
						<h4 class="variant-name">{v.name}</h4>
						<p class="variant-when">When {conditionText(v.when)}</p>
						<p>{v.summary}</p>
					</div>
				{/each}
			</section>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.pattern-page {
		height: 100%;
		overflow-y: auto;
		background: var(--color-surface);
	}

	.pattern-main {
		max-width: 42rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
	}

	.back {
		font-size: 0.75rem;
		color: var(--color-text);
	}

	.placeholder-banner {
		margin: 1rem 0 0;
		padding: 0.5rem 0.75rem;
		border: 1px dashed #c89a5a;
		border-radius: 4px;
		background: var(--fh-lantern-tint);
		font-size: 0.75rem;
		color: #5a3408;
	}

	.pattern-title {
		font-family: var(--font-display);
		font-weight: normal;
		font-size: 2.2rem;
		line-height: 1.05;
		margin: 1rem 0 0.5rem;
	}

	.pattern-summary { font-size: 0.95rem; line-height: 1.5; margin: 0 0 0.75rem; }


	.pattern-section { margin-top: 1.25rem; }

	.section-heading {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin: 0 0 0.35rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid var(--color-border);
	}

	.pattern-section p { font-size: 0.85rem; line-height: 1.55; margin: 0; }
	.variant + .variant { margin-top: 0.75rem; }
	.variant-name { margin: 0; font-size: 0.85rem; }
	.pattern-section .variant-when { font-size: 0.72rem; color: var(--fh-stone); }
</style>
