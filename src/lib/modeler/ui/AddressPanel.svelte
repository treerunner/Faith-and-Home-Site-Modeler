<script lang="ts">
	import { store } from '../store.svelte';
	import { fetchContext, fetchGeocode, fetchSuggestions, type Suggestion } from '../address';

	// Address search at the top of the palette. Picking an address loads the neighborhood and
	// starts parcel setup; once set, it shows the address with a way to change it.

	const DEBOUNCE_MS = 300;

	let query = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let active = $state(-1);
	let open = $state(false);
	let status = $state<{ busy: boolean; message: string; retry?: () => void }>({ busy: false, message: '' });
	let confirmingClear = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let inflight: AbortController | undefined;

	function onInput() {
		clearTimeout(timer);
		inflight?.abort();
		status = { busy: false, message: '' };
		const q = query.trim();
		if (q.length < 3) {
			suggestions = [];
			open = false;
			return;
		}
		timer = setTimeout(async () => {
			inflight = new AbortController();
			try {
				suggestions = await fetchSuggestions(q, inflight.signal);
				active = -1;
				open = suggestions.length > 0;
			} catch (e) {
				if ((e as Error).name !== 'AbortError') suggestions = [];
			}
		}, DEBOUNCE_MS);
	}

	async function choose(s: Suggestion) {
		open = false;
		query = s.label;
		await locate(async () => {
			// Street-level suggestions sit mid-block; the Census geocoder can place a house number
			if (!s.precise) return (await fetchGeocode(s.label).catch(() => null)) ?? s;
			return s;
		});
	}

	async function submitFreeText() {
		const q = query.trim();
		if (!q) return;
		open = false;
		await locate(async () => (await fetchGeocode(q)) ?? suggestions[0] ?? null);
	}

	async function locate(find: () => Promise<Suggestion | null>) {
		const run = async () => {
			status = { busy: true, message: 'Finding the address' };
			try {
				const place = await find();
				if (!place) {
					status = { busy: false, message: 'No match. Try a fuller address.' };
					return;
				}
				status = { busy: true, message: 'Loading the neighborhood' };
				const context = await fetchContext(place.lat, place.lng);
				store.startAddress(place, context);
				status = { busy: false, message: '' };
				query = '';
			} catch (e) {
				status = { busy: false, message: (e as Error).message, retry: run };
			}
		};
		await run();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' && suggestions.length) {
			e.preventDefault();
			open = true;
			active = (active + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp' && suggestions.length) {
			e.preventDefault();
			active = active <= 0 ? suggestions.length - 1 : active - 1;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (open && active >= 0) choose(suggestions[active]);
			else submitFreeText();
		} else if (e.key === 'Escape' && open) {
			e.stopPropagation();
			open = false;
		}
	}
</script>

<section class="address" aria-label="Address">
	<h2 class="address__heading">Address</h2>

	{#if store.site.address}
		<p class="address__current">{store.site.address}</p>
		{#if confirmingClear}
			<p class="address__note">Clear the address and neighborhood? Structures stay.</p>
			<div class="address__actions">
				<button class="address__btn address__btn--danger" onclick={() => { store.clearAddress(); confirmingClear = false; }}>Clear</button>
				<button class="address__btn" onclick={() => (confirmingClear = false)}>Cancel</button>
			</div>
		{:else}
			<div class="address__actions">
				{#if !store.site.parcel && !store.setup}
					<button class="address__btn" onclick={() => store.startDrawingParcel()}>Draw parcel</button>
				{/if}
				<button class="address__btn" onclick={() => (confirmingClear = true)}>Change</button>
			</div>
			<!-- Terrain: fetched at setup; sites set up before terrain can add it -->
			{#if store.terrainState === 'loading'}
				<p class="address__note address__note--busy" role="status">Loading terrain…</p>
			{:else if store.terrainState === 'failed'}
				<p class="address__note" role="status">
					No elevation data here. The board stays flat.
					<button class="address__link" onclick={() => store.loadTerrain()}>Try again</button>
				</p>
			{:else if !store.site.context.terrain && !store.readOnly}
				<button class="address__btn address__terrain" onclick={() => store.loadTerrain()}>Add terrain</button>
			{/if}
		{/if}
	{:else}
		<div class="address__combo">
			<input
				class="address__input"
				type="text"
				role="combobox"
				aria-label="Find an address"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="address-suggestions"
				aria-activedescendant={active >= 0 ? `address-option-${active}` : undefined}
				placeholder="Find an address"
				autocomplete="off"
				disabled={status.busy}
				bind:value={query}
				oninput={onInput}
				onkeydown={onKeyDown}
				onblur={() => setTimeout(() => (open = false), 150)}
			/>
			{#if open}
				<ul class="address__list" id="address-suggestions" role="listbox" aria-label="Address suggestions">
					{#each suggestions as s, i (s.label)}
						<li
							id="address-option-{i}"
							class="address__option"
							class:address__option--active={i === active}
							role="option"
							aria-selected={i === active}
							onpointerdown={(e) => { e.preventDefault(); choose(s); }}
						>{s.label}</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if status.message}
			<p class="address__note" class:address__note--busy={status.busy} role="status">
				{status.message}{status.busy ? '…' : ''}
				{#if status.retry}<button class="address__link" onclick={status.retry}>Try again</button>{/if}
			</p>
		{:else}
			<p class="address__note">Start from a real place, or use the grid.</p>
		{/if}
	{/if}
</section>

<style>
	.address {
		position: relative;
		padding-bottom: 0.75rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.address__heading {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0 0 0.4rem;
		color: var(--color-text);
	}

	.address__combo { position: relative; }

	.address__input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: #fff;
		font-size: 0.72rem;
		font-family: inherit;
		color: var(--color-text);
	}

	.address__input:focus { outline: 1px solid var(--color-selection); border-color: var(--color-selection); }

	/* Wider than the palette: suggestions spill over the canvas */
	.address__list {
		position: absolute;
		top: calc(100% + 2px);
		left: 0;
		width: 22rem;
		z-index: 20;
		list-style: none;
		margin: 0;
		padding: 0.2rem;
		background: #fff;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
	}

	.address__option {
		padding: 0.35rem 0.45rem;
		border-radius: 3px;
		font-size: 0.72rem;
		cursor: pointer;
	}

	.address__option:hover,
	.address__option--active { background: var(--fh-dusk-tint); }

	.address__current {
		margin: 0 0 0.4rem;
		font-size: 0.72rem;
		line-height: 1.35;
		color: var(--color-text);
	}

	.address__note {
		margin: 0.35rem 0 0;
		font-size: 0.66rem;
		line-height: 1.4;
		color: var(--fh-stone);
	}

	.address__note--busy { color: var(--color-text); }
	.address__terrain { margin-top: 0.35rem; }

	.address__actions {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.3rem;
	}

	.address__btn {
		flex: 1;
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.68rem;
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
	}

	.address__btn:hover { background: #ece8e0; }

	.address__btn--danger { border-color: #c8a090; color: #9a3a2a; }
	.address__btn--danger:hover { background: #fdf0ee; }

	.address__link {
		border: none;
		background: none;
		padding: 0;
		margin-left: 0.25rem;
		font: inherit;
		color: var(--color-selection);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
