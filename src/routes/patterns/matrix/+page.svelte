<script lang="ts">
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import MatrixGrid from '#lib/patterns/MatrixGrid.svelte';
	import { coverage } from '#lib/patterns/match';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let covered = $derived(coverage(data.patterns).filter((c) => c.pattern).length);
</script>

<svelte:head>
	<title>Pattern matrix</title>
</svelte:head>

<div class="matrix-page">
	<Masthead />
	<main class="matrix-main">
		<a class="back" href="/patterns">Pattern library</a>
		<h2 class="matrix-title">Pattern matrix</h2>
		<p class="matrix-intro">
			Every site sits in one cell: its site type, building type and development type.
			{covered} of 60 cells have a written pattern.
		</p>
		<MatrixGrid patterns={data.patterns} />
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.matrix-page {
		height: 100%;
		overflow-y: auto;
		background: var(--color-surface);
	}

	.matrix-main {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		overflow-x: auto;
	}

	.back { font-size: 0.75rem; color: var(--color-text); }

	.matrix-title {
		font-family: var(--font-display);
		font-weight: normal;
		font-size: 1.8rem;
		margin: 1rem 0 0.4rem;
	}

	.matrix-intro { font-size: 0.85rem; line-height: 1.5; margin: 0 0 1.25rem; }
</style>
