<script lang="ts" module>
	import { goto } from '$app/navigation';
	import { store } from '../store.svelte';
	import { duplicateSite, editUrl, viewUrl } from '../api';

	// The first save of a new site moves the URL from /modeler to /modeler/<id> so reloads keep it.
	export async function saveSite(): Promise<boolean> {
		const firstSave = !store.isPersisted;
		const ok = await store.save();
		if (ok && firstSave) await goto(editUrl(store.site.id), { replace: true, reset: false });
		return ok;
	}
</script>

<script lang="ts">

	let notice = $state('');
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let busy = $state(false);

	function flash(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = ''), 2000);
	}

	let status = $derived(
		notice ||
			(store.saveState === 'saving'
				? 'Saving'
				: store.saveState === 'error'
					? 'Save failed'
					: store.isDirty
						? 'Unsaved changes'
						: store.isPersisted
							? 'Saved'
							: ''),
	);

	async function ensureSaved(): Promise<boolean> {
		if (store.isPersisted && !store.isDirty) return true;
		return saveSite();
	}

	async function share() {
		busy = true;
		try {
			if (!(await ensureSaved())) return;
			await navigator.clipboard.writeText(new URL(viewUrl(store.site.id), location.origin).href);
			flash('Link copied');
		} catch (e) {
			console.error(e);
			flash('Copy failed');
		} finally {
			busy = false;
		}
	}

	async function duplicate() {
		busy = true;
		try {
			if (!(await ensureSaved())) return;
			const copy = await duplicateSite(store.site.id);
			await goto(editUrl(copy.id));
		} catch (e) {
			console.error(e);
			flash('Duplicate failed');
		} finally {
			busy = false;
		}
	}
</script>

<div class="site-bar">
	{#if store.readOnly}
		<span class="view-only-tag">View only</span>
		<a class="bar-btn" href={editUrl(store.site.id)}>Open in editor</a>
	{:else}
		<span class="save-status" class:save-status--error={store.saveState === 'error'} aria-live="polite">{status}</span>
		<button
			class="bar-btn bar-btn--primary"
			onclick={saveSite}
			disabled={store.saveState === 'saving' || (store.isPersisted && !store.isDirty)}
			title="Save (Cmd+S)"
		>Save</button>
		<button class="bar-btn" onclick={share} disabled={busy} title="Copy a view-only link">Share</button>
		<button class="bar-btn" onclick={duplicate} disabled={busy} title="Save a copy as a new scenario">Duplicate</button>
	{/if}
	<a class="bar-btn" href="/modeler/sites">Sites</a>
</div>

<style>
	.site-bar {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.save-status {
		font-size: 0.68rem;
		color: var(--fh-stone);
		min-width: 6.5em;
		text-align: right;
	}

	.save-status--error { color: var(--fh-terracotta); }

	.view-only-tag {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		background: var(--fh-dusk-tint);
		color: var(--color-text);
	}

	.bar-btn {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.7rem;
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
		text-decoration: none;
		line-height: normal;
	}

	.bar-btn:hover:not(:disabled) { background: #ece8e0; }
	.bar-btn:disabled { opacity: 0.4; cursor: default; }

	.bar-btn--primary {
		background: var(--fh-dusk);
		border-color: var(--fh-dusk);
		color: #fff;
	}

	.bar-btn--primary:hover:not(:disabled) { background: #5a70a6; }
</style>
