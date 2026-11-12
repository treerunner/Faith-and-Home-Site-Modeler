<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import EditorLayout from './EditorLayout.svelte';
	import Masthead from './Masthead.svelte';
	import { saveSite } from './SiteBar.svelte';
	import { store } from '../store.svelte';

	function isEditing(e: KeyboardEvent): boolean {
		const tag = (e.target as HTMLElement)?.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
	}

	function handleKeyDown(e: KeyboardEvent) {
		const meta = e.metaKey || e.ctrlKey;

		if (meta && e.key === 's') {
			e.preventDefault();
			saveSite();
			return;
		}

		if (store.readOnly) return;

		if (meta && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			store.undo();
			return;
		}

		if ((meta && e.shiftKey && e.key === 'z') || (meta && e.key === 'y')) {
			e.preventDefault();
			store.redo();
			return;
		}

		if (isEditing(e)) return;

		const id = store.selectedPartId;
		if (!id) return;

		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			store.deletePart(id);
			return;
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			store.selectPart(null);
			return;
		}

		if (e.key === 'r' || e.key === 'R') {
			e.preventDefault();
			store.rotatePart(id, e.shiftKey ? -15 : 15);
			return;
		}
	}

	// Warn before leaving with unsaved changes. On a full unload, cancel() shows the browser's dialog.
	beforeNavigate(({ cancel, willUnload }) => {
		if (store.readOnly || !store.isDirty) return;
		if (willUnload || !confirm('Leave without saving? Your changes will be lost.')) cancel();
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

<svelte:head>
	<title>{store.site.name || 'Site Modeler'}</title>
</svelte:head>

<div class="modeler-page">
	<Masthead />
	<div class="editor-wrap">
		<EditorLayout />
	</div>
</div>

<style>
	:global(html, body) {
		height: 100%;
		overflow: hidden;
	}

	.modeler-page {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.editor-wrap {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
