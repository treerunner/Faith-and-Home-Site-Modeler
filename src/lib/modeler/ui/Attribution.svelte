<script lang="ts">
	import { store } from '../store.svelte';
	import { creditGroups } from '../credits';

	// Data credits, required by the sources' licenses wherever their data is shown. A small
	// info button keeps them one click away without covering the model.

	let groups = $derived(creditGroups(store.site.context));
	let open = $state(false);
	let rootEl: HTMLDivElement | undefined = $state();

	// composedPath is fixed at dispatch, so clicks inside count even if the card re-renders
	function handleWindowClick(e: MouseEvent) {
		if (open && rootEl && !e.composedPath().includes(rootEl)) open = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.stopPropagation();
			open = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeyDown} />

{#if groups.length}
	<div class="credits" bind:this={rootEl}>
		<button
			class="credits__btn"
			aria-label="Data credits"
			aria-expanded={open}
			aria-controls="data-credits"
			title="Data credits"
			onclick={() => (open = !open)}
		>i</button>
		{#if open}
			<div class="credits__card" id="data-credits" role="dialog" aria-label="Data credits">
				<h2 class="credits__heading">Data credits</h2>
				{#each groups as g (g.heading)}
					<p class="credits__group">
						<span class="credits__label">{g.heading}</span>
						{g.credits.join(', ')}
					</p>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.credits {
		position: absolute;
		left: 0.5rem;
		top: 0.5rem;
		z-index: 5;
	}

	.credits__btn {
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		border: 1px solid var(--color-border);
		background: rgba(247 247 242 / 0.9);
		color: var(--fh-stone);
		font: italic 600 0.72rem/1 Georgia, serif;
		cursor: pointer;
		padding: 0;
	}

	.credits__btn:hover,
	.credits__btn[aria-expanded='true'] {
		color: var(--color-text);
		border-color: var(--fh-stone);
	}

	.credits__card {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 0;
		width: max-content;
		max-width: 18rem;
		padding: 0.55rem 0.7rem;
		background: #fff;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
		font-size: 0.68rem;
		line-height: 1.45;
		color: var(--color-text);
	}

	.credits__heading {
		margin: 0 0 0.3rem;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.credits__group { margin: 0.2rem 0 0; }

	.credits__label {
		display: block;
		font-weight: 600;
		color: var(--fh-stone);
	}
</style>
