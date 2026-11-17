<script lang="ts">
	import type { Annotation } from '../types';

	// A plan's notes, numbered as on its picture, as the pattern book does
	let { notes }: { notes: Annotation[] } = $props();
</script>

{#if notes.length}
	<ol class="report-notes" aria-label="Notes">
		{#each notes as a (a.n)}
			<li><span class="report-note-num" aria-hidden="true">{a.n}</span>{a.text}</li>
		{/each}
	</ol>
{/if}
