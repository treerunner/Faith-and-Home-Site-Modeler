<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ModelerPage from '#lib/modeler/ui/ModelerPage.svelte';
	import { saveSite, takeUnsavedSketch } from '#lib/modeler/ui/SiteBar.svelte';
	import { normalizeSite } from '#lib/modeler/serialize';
	import { store } from '#lib/modeler/store.svelte';

	// The store outlives navigation; start fresh each time this route mounts. Back from signing in
	// to save (?restore=1), the sketch kept in this tab returns, and the save goes ahead.
	const sketch = page.url.searchParams.get('restore') ? takeUnsavedSketch() : null;
	if (sketch) store.restoreUnsaved(normalizeSite(sketch));
	else store.newSite();

	onMount(() => {
		if (sketch && page.data.user) setTimeout(() => saveSite(), 300); // once the canvas has drawn, for the thumbnail
	});
</script>

<ModelerPage />
