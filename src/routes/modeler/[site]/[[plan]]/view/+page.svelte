<script lang="ts">
	import { untrack } from 'svelte';
	import ModelerPage from '#lib/modeler/ui/ModelerPage.svelte';
	import { store } from '#lib/modeler/store.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	$effect.pre(() => {
		const { site, siteSlug, planId } = data;
		untrack(() => store.loadSite(site, siteSlug, planId, true));
	});
</script>

<ModelerPage />
