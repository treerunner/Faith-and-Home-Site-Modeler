<script lang="ts">
	import EditorLayout from '#lib/modeler/ui/EditorLayout.svelte';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import { store } from '#lib/modeler/store.svelte';

	function isEditing(e: KeyboardEvent): boolean {
		const tag = (e.target as HTMLElement)?.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
	}

	function handleKeyDown(e: KeyboardEvent) {
		const meta = e.metaKey || e.ctrlKey;

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
</script>

<svelte:window onkeydown={handleKeyDown} />

<svelte:head>
	<title>Site Modeler</title>
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
