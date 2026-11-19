<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import Caret from './Caret.svelte';

	// A collapsible section of a side panel. Open by default; what you collapse is remembered in
	// this browser (a convenience, so it can't break anything if storage is unavailable).
	interface Props {
		title: string;
		key: string; // stable id for remembering
		children: Snippet;
	}

	let { title, key, children }: Props = $props();

	const STORAGE = 'fh-collapsed-sections';
	function collapsedKeys(): string[] {
		try {
			return JSON.parse(localStorage.getItem(STORAGE) ?? '[]') as string[];
		} catch {
			return [];
		}
	}

	// The key is fixed for a section's life: read once
	let collapsed = $state(untrack(() => collapsedKeys().includes(key)));

	function toggle() {
		collapsed = !collapsed;
		try {
			const keys = new Set(collapsedKeys());
			if (collapsed) keys.add(key);
			else keys.delete(key);
			localStorage.setItem(STORAGE, JSON.stringify([...keys]));
		} catch {
			// storage unavailable: the section still toggles for this visit
		}
	}
</script>

<div class="panel-section">
	<h2 class="panel-section__heading">
		<button class="panel-section__toggle" aria-expanded={!collapsed} onclick={toggle}>
			<Caret open={!collapsed} />
			{title}
		</button>
	</h2>
	{#if !collapsed}
		<div class="panel-section__body">{@render children()}</div>
	{/if}
</div>

<style>
	.panel-section { display: flex; flex-direction: column; gap: 0.6rem; }
	.panel-section__heading { margin: 0; }
	.panel-section__toggle {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
	}
	.panel-section__toggle:hover { opacity: 0.7; }
	.panel-section__body { display: flex; flex-direction: column; gap: 0.6rem; }
</style>
