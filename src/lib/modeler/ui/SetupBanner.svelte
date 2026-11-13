<script lang="ts">
	import { store } from '../store.svelte';

	// Guides address setup after the neighborhood loads: choose or draw the parcel, then
	// decide whether its buildings join the current plan.

	let candidates = $derived(store.setup?.context.parcels.length ?? 0);
	let prefill = $derived(store.setup?.prefill ?? null);
	let drawing = $derived(store.mode.type === 'drawingParcel' ? store.mode : null);

	function cancelDrawing() {
		if (candidates) store.mode = { type: 'choosingParcel' };
		else store.finishSetup();
	}

	function names(list: NonNullable<typeof prefill>): string {
		const named = list.map((b) => b.name).filter(Boolean) as string[];
		if (!named.length) return '';
		return named.length > 2 ? `${named.slice(0, 2).join(', ')} and ${named.length - 2} more` : named.join(' and ');
	}
</script>

{#if store.mode.type === 'choosingParcel'}
	<div class="banner" role="status">
		<span class="banner__text">Click your parcel.</span>
		<button class="banner__btn" onclick={() => store.startDrawingParcel()}>Draw it instead</button>
		<button class="banner__btn banner__btn--quiet" onclick={() => store.finishSetup()}>Skip</button>
	</div>
{:else if drawing}
	<div class="banner" role="status">
		<span class="banner__text">
			{#if drawing.points.length === 0}
				{candidates ? 'Click to trace your lot.' : store.setup?.context.parcelsFailed ? 'Parcel data is unavailable right now. Click to trace your lot.' : 'No parcel data here. Click to trace your lot.'}
			{:else if drawing.points.length < 3}
				{drawing.points.length} point{drawing.points.length > 1 ? 's' : ''}. Need at least 3.
			{:else}
				{drawing.points.length} points. Click the first point to close.
			{/if}
		</span>
		<button class="banner__btn banner__btn--quiet" onclick={cancelDrawing}>{candidates ? 'Back to parcels' : 'Skip'}</button>
	</div>
{:else if store.setup?.growing}
	<div class="banner" role="status">
		<span class="banner__text">This parcel is large. Loading more of the neighborhood…</span>
	</div>
{:else if prefill}
	<div class="banner" role="dialog" aria-label="Add buildings">
		<span class="banner__text">
			Add the {prefill.length === 1 ? 'building' : `${prefill.length} buildings`} on this parcel to {store.plan.name || 'this plan'}?
			{#if names(prefill)}<span class="banner__detail">{names(prefill)}</span>{/if}
		</span>
		<button class="banner__btn banner__btn--primary" onclick={() => store.prefillBuildings()}>Add buildings</button>
		<button class="banner__btn banner__btn--quiet" onclick={() => store.finishSetup()}>Skip</button>
	</div>
{/if}

<style>
	.banner {
		position: absolute;
		bottom: 2.75rem;
		left: 50%;
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-width: calc(100% - 2rem);
		background: #fff;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0 0 0 / 0.08);
		padding: 0.4rem 0.5rem 0.4rem 0.75rem;
		font-size: 0.72rem;
		color: var(--color-text);
	}

	.banner__text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.banner__detail {
		font-size: 0.66rem;
		color: var(--fh-stone);
	}

	.banner__btn {
		flex-shrink: 0;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.7rem;
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
		white-space: nowrap;
	}

	.banner__btn:hover { background: #ece8e0; }

	.banner__btn--primary {
		background: var(--fh-dusk);
		border-color: var(--fh-dusk);
		color: #fff;
	}

	.banner__btn--primary:hover { background: #5a70a6; }

	.banner__btn--quiet { border-color: transparent; }
</style>
