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
			store.loadSite(site, siteSlug, planId, true, rights);
			compareFromUrl(page.url.searchParams);
		});
	});
</script>

<ModelerPage />
