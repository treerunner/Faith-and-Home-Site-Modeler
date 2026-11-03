<script lang="ts">
	import EditorLayout from '#lib/modeler/ui/EditorLayout.svelte';
	import { store } from '#lib/modeler/store.svelte';

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
	<EditorLayout />
</div>

<style>
	:global(html, body) {
		height: 100%;
		overflow: hidden;
	}

	.modeler-page {
		width: 100%;
		height: 100%;
	}
</style>
