<script lang="ts">
	import type { ActionStep } from '../metrics';

	// Flags first, then suggestions, then notes
	let { steps }: { steps: ActionStep[] } = $props();
	const ORDER = ['flag', 'suggest', 'info'] as const;
	let sorted = $derived(ORDER.flatMap((sev) => steps.filter((s) => s.severity === sev)));
</script>

<div class="steps-list">
	{#each sorted as step (step.message)}
		<div class="step step--{step.severity}">
			<span class="step-chip step-chip--{step.severity}">{step.category}</span>
			<span class="step-msg">{step.message}</span>
		</div>
	{/each}
</div>
