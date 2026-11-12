<script lang="ts">
	import { untrack } from 'svelte';
	import ModelerPage from '#lib/modeler/ui/ModelerPage.svelte';
	import { store } from '#lib/modeler/store.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	$effect.pre(() => {
		const site = data.site;
		untrack(() => {
			// After the first save from /modeler the store already holds this site; keep its undo history.
			// Dirty means the user chose to leave without saving, so reload.
			if (store.site.id === site.id && store.isPersisted && !store.readOnly && !store.isDirty) return;
			store.loadSite(site, false);
		});
	});
</script>

<ModelerPage />
