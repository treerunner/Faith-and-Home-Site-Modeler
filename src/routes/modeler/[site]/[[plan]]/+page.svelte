<script lang="ts">
	import { untrack } from 'svelte';
	import ModelerPage from '#lib/modeler/ui/ModelerPage.svelte';
	import { store } from '#lib/modeler/store.svelte';
	import { compareFromUrl } from '#lib/modeler/ui/SiteBar.svelte';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	$effect.pre(() => {
		const { site, siteSlug, planId, rights } = data;
		untrack(() => {
			// The store already holds this site after a save from /modeler or a plan switch: keep
			// its undo history. Dirty means the user chose to leave without saving, so reload.
			if (store.site.id === site.id && store.isPersisted && !store.readOnly && !store.isDirty) store.switchPlan(planId);
			else store.loadSite(site, siteSlug, planId, false, rights);
			compareFromUrl(page.url.searchParams);
		});
	});
</script>

<ModelerPage />
