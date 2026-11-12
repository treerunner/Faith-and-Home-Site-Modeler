<script lang="ts">
	import ModelerPage from '#lib/modeler/ui/ModelerPage.svelte';
	import { store } from '#lib/modeler/store.svelte';

	// The store outlives navigation; start fresh each time this route mounts.
	store.newSite();
</script>

<ModelerPage />
