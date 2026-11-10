<script lang="ts">
	import { store } from '../store.svelte';
	import { statusColor } from '../colors';
	import type { Roof, Status, Structure, Use } from '../types';

	const USE_COLORS: Record<Use, string> = {
		worship:        '#5b6cb8',
		fellowship:     '#4fa86e',
		education:      '#d4a040',
		office:         '#7a8aaa',
		housing:        '#e07040',
		community:      '#e09828',
		daycare:        '#a070c0',
		social_services:'#c05870',
		other:          '#c06060',
	};

	const STATUS_OPTIONS: { value: Status; label: string }[] = [
		{ value: 'existing', label: 'Existing' },
		{ value: 'adaptive_reuse', label: 'Reuse' },
		{ value: 'new', label: 'New' },
		{ value: 'removed', label: 'Removed' },
	];

	const USE_OPTIONS: { value: Use; label: string }[] = [
		{ value: 'worship', label: 'Worship' },
		{ value: 'fellowship', label: 'Fellowship' },
		{ value: 'education', label: 'Education' },
		{ value: 'office', label: 'Office' },
		{ value: 'housing', label: 'Housing' },
		{ value: 'community', label: 'Community' },
		{ value: 'daycare', label: 'Daycare' },
		{ value: 'social_services', label: 'Social services' },
		{ value: 'other', label: 'Other' },
	];

	const ROOF_OPTIONS: { value: Roof; label: string }[] = [
		{ value: 'flat', label: 'Flat' },
		{ value: 'gable', label: 'Gable' },
		{ value: 'object', label: 'Object' },
	];

	let structures = $derived(store.site.structures);
	let selectedOS = $derived(store.selectedOpenSpace);

	// Track which structure is expanded — syncs when canvas selection changes
	let expandedId = $state('');
	$effect(() => {
		if (store.activeStructureId) expandedId = store.activeStructureId;
	});

	function toggleStructure(id: string) {
		if (expandedId === id) {
			expandedId = '';
		} else {
			store.selectStructure(id);
			expandedId = id;
		}
	}

	function toggleUse(structureId: string, use: Use, checked: boolean) {
		const s = store.site.structures.find((s) => s.id === structureId);
		if (!s) return;
		const uses = checked ? [...s.uses, use] : s.uses.filter((u) => u !== use);
		const useWeights = { ...s.useWeights };
		if (checked) { if (!useWeights[use]) useWeights[use] = 50; }
		else delete useWeights[use];
		store.updateStructure(structureId, { uses, useWeights });
	}

	function setWeight(s: Structure, use: Use, weight: number) {
		store.updateStructure(s.id, { useWeights: { ...s.useWeights, [use]: Math.max(1, weight) } });
	}

	function allocPct(s: Structure, use: Use): number {
		const total = s.uses.reduce((sum, u) => sum + (s.useWeights?.[u] ?? 50), 0);
		return total > 0 ? ((s.useWeights?.[use] ?? 50) / total) * 100 : 0;
	}
</script>

<aside class="props-panel" aria-label="Properties panel">
	<div class="section">
		<h2 class="panel-heading">Structures</h2>

		{#if structures.length === 0}
			<p class="empty-hint">Drag a shape onto the canvas to add a structure.</p>
		{:else}
			<ul class="struct-list" role="list">
				{#each structures as s (s.id)}
					{@const isOpen = expandedId === s.id}
					<li class="struct-item" class:struct-item--open={isOpen}>
						<button
							class="struct-row"
							class:struct-row--active={s.id === store.activeStructureId}
							onclick={() => toggleStructure(s.id)}
							aria-expanded={isOpen}
							aria-label="{isOpen ? 'Collapse' : 'Expand'} {s.label}"
						>
							<span class="caret" class:caret--open={isOpen} aria-hidden="true">▶</span>
							<span class="struct-label">{s.label}</span>
							{#if s.groupId}
								<span class="group-badge" title="Grouped — moves with linked structures">⚭</span>
							{/if}
							<span class="status-chip" style="background:{statusColor(s.status)}" aria-label={s.status}></span>
						</button>

						{#if isOpen}
							<div class="struct-props">
								<label class="field-label" for="struct-label-{s.id}">Label</label>
								<input
									id="struct-label-{s.id}"
									class="text-input"
									type="text"
									value={s.label}
									oninput={(e) => store.updateStructure(s.id, { label: (e.target as HTMLInputElement).value })}
								/>

								<fieldset class="fieldset">
									<legend class="field-label">Status</legend>
									<div class="pill-group">
										{#each STATUS_OPTIONS as opt (opt.value)}
											<button
												class="pill"
												class:pill--active={s.status === opt.value}
												style={s.status === opt.value ? `background:${statusColor(opt.value)};border-color:${statusColor(opt.value)};color:#fff` : ''}
												onclick={() => store.updateStructure(s.id, { status: opt.value })}
											>{opt.label}</button>
										{/each}
									</div>
								</fieldset>

								<fieldset class="fieldset">
									<legend class="field-label">Uses</legend>
									<div class="uses-grid">
										{#each USE_OPTIONS as opt (opt.value)}
											<label class="use-label">
												<input
													type="checkbox"
													checked={s.uses.includes(opt.value)}
													onchange={(e) => toggleUse(s.id, opt.value, (e.target as HTMLInputElement).checked)}
												/>
												{opt.label}
											</label>
										{/each}
									</div>
								</fieldset>

								{#if s.uses.length > 0}
									<div class="alloc-section">
										<div class="alloc-bar" aria-hidden="true">
											{#each s.uses as use (use)}
												<div class="alloc-seg" style="width:{allocPct(s, use)}%;background:{USE_COLORS[use]}"></div>
											{/each}
										</div>
										{#each s.uses as use (use)}
											{@const opt = USE_OPTIONS.find(o => o.value === use)}
											{@const pct = allocPct(s, use)}
											<div class="alloc-row">
												<span class="alloc-dot" style="background:{USE_COLORS[use]}"></span>
												<span class="alloc-name">{opt?.label ?? use}</span>
												<input
													class="alloc-slider"
													type="range"
													min="1"
													max="100"
													value={s.useWeights?.[use] ?? 50}
													oninput={(e) => setWeight(s, use, Number((e.target as HTMLInputElement).value))}
												/>
												<span class="alloc-pct">{Math.round(pct)}%</span>
											</div>
										{/each}
									</div>
								{/if}

								<div class="row-fields">
									<div class="field-group">
										<label class="field-label" for="struct-stories-{s.id}">Stories</label>
										<input
											id="struct-stories-{s.id}"
											class="num-input"
											type="number"
											min="1"
											max="99"
											value={s.stories}
											oninput={(e) => store.updateStructure(s.id, { stories: Number((e.target as HTMLInputElement).value) })}
										/>
									</div>
									<div class="field-group">
										<label class="field-label" for="struct-floor-{s.id}">Floor ht (m)</label>
										<input
											id="struct-floor-{s.id}"
											class="num-input"
											type="number"
											min="2"
											max="20"
											step="0.5"
											value={s.floorHeight}
											oninput={(e) => store.updateStructure(s.id, { floorHeight: Number((e.target as HTMLInputElement).value) })}
										/>
									</div>
								</div>

								<label class="field-label" for="struct-roof-{s.id}">Roof</label>
								<select
									id="struct-roof-{s.id}"
									class="select-input"
									value={s.roof}
									onchange={(e) => store.updateStructure(s.id, { roof: (e.target as HTMLSelectElement).value as Roof })}
								>
									{#each ROOF_OPTIONS as opt (opt.value)}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>

								<div class="action-row">
									{#if s.groupId}
										<button class="split-btn" onclick={() => store.ungroupStructure(s.id)}>
											Ungroup
										</button>
									{/if}
									<button class="delete-btn" onclick={() => store.deleteStructure(s.id)}>Delete</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Open space properties when one is selected -->
	{#if selectedOS}
		{@const os = selectedOS}
		<div class="section section--props">
			<h2 class="panel-heading">Open Space</h2>

			<label class="field-label" for="os-label">Label</label>
			<input
				id="os-label"
				class="text-input"
				type="text"
				placeholder={os.kind.charAt(0).toUpperCase() + os.kind.slice(1)}
				value={os.label ?? ''}
				oninput={(e) => store.updateOpenSpace(os.id, { label: (e.target as HTMLInputElement).value || undefined })}
			/>

			<p class="field-label" style="margin-top:0.4rem">Kind: {os.kind}</p>

			<button
				class="delete-btn"
				onclick={() => { store.deleteOpenSpace(os.id); store.selectOpenSpace(null); }}
			>Delete</button>
		</div>
	{/if}
</aside>

<style>
	.props-panel {
		width: 220px;
		flex-shrink: 0;
		background: #f8f5ee;
		border-left: 1px solid #d4c5a9;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		user-select: none;
	}

	.section {
		padding: 0.75rem;
		border-bottom: 1px solid #e8deca;
	}

	.section--props {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.panel-heading {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6b5f4e;
		margin: 0 0 0.5rem;
	}

	.empty-hint {
		font-size: 0.65rem;
		color: #9a8a76;
		line-height: 1.4;
		margin: 0;
	}

	.struct-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.struct-item {
		border-radius: 3px;
		overflow: hidden;
	}

	.struct-item--open {
		border: 1px solid #c8b898;
		background: #f0ece3;
	}

	.struct-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.3rem 0.4rem;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.75rem;
		color: #4a3f30;
		text-align: left;
		border-radius: 3px;
	}

	.struct-row:hover { background: rgba(0 0 0 / 0.05); }
	.struct-row--active { font-weight: 600; }

	.caret {
		font-size: 0.5rem;
		color: #9a8a76;
		flex-shrink: 0;
		transition: transform 0.15s ease;
		display: inline-block;
	}

	.caret--open { transform: rotate(90deg); }

	.struct-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.status-chip {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
		border: 1px solid rgba(0 0 0 / 0.15);
	}

	.group-badge {
		font-size: 0.65rem;
		color: #7c6a52;
		flex-shrink: 0;
		line-height: 1;
	}

	.struct-props {
		padding: 0.5rem 0.6rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		border-top: 1px solid #d8ceba;
	}

	.field-label {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #6b5f4e;
		display: block;
		margin-bottom: 0.15rem;
	}

	.text-input, .select-input {
		width: 100%;
		padding: 0.25rem 0.35rem;
		border: 1px solid #d4c5a9;
		border-radius: 3px;
		background: #fff;
		font-size: 0.72rem;
		color: #2a1f10;
	}

	.text-input:focus, .select-input:focus {
		outline: 2px solid var(--color-selection);
		border-color: transparent;
	}

	.fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}

	.pill-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.pill {
		padding: 0.15rem 0.35rem;
		border: 1px solid #d4c5a9;
		border-radius: 10px;
		background: #fff;
		font-size: 0.62rem;
		cursor: pointer;
		color: #4a3f30;
	}

	.pill:hover { border-color: #9a8a76; }
	.pill--active { font-weight: 600; }

	.uses-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.15rem 0.4rem;
	}

	.use-label {
		font-size: 0.68rem;
		color: #4a3f30;
		display: flex;
		align-items: center;
		gap: 0.2rem;
		cursor: pointer;
		user-select: none;
	}

	.row-fields {
		display: flex;
		gap: 0.4rem;
	}

	.field-group {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.num-input {
		width: 100%;
		padding: 0.25rem 0.35rem;
		border: 1px solid #d4c5a9;
		border-radius: 3px;
		background: #fff;
		font-size: 0.72rem;
		color: #2a1f10;
	}

	.num-input:focus { outline: 2px solid var(--color-selection); border-color: transparent; }

	.action-row {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.1rem;
	}

	.delete-btn {
		flex: 1;
		padding: 0.25rem 0.4rem;
		border: 1px solid #c8a090;
		border-radius: 3px;
		background: none;
		color: #9a3a2a;
		font-size: 0.68rem;
		cursor: pointer;
	}

	.delete-btn:hover { background: #fdf0ee; }

	.split-btn {
		flex: 1;
		padding: 0.25rem 0.4rem;
		border: 1px solid #c8b898;
		border-radius: 3px;
		background: none;
		color: #6b5f4e;
		font-size: 0.68rem;
		cursor: pointer;
	}

	.split-btn:hover { background: #ece8e0; }

	.alloc-section {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.alloc-bar {
		display: flex;
		height: 8px;
		border-radius: 3px;
		overflow: hidden;
		gap: 1px;
		background: #e0d8cc;
	}

	.alloc-seg {
		height: 100%;
		transition: width 0.1s;
		min-width: 2px;
	}

	.alloc-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.alloc-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.alloc-name {
		font-size: 0.6rem;
		color: #6b5f4e;
		width: 52px;
		flex-shrink: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.alloc-slider {
		flex: 1;
		min-width: 0;
		height: 3px;
		accent-color: #6b5f4e;
		cursor: pointer;
	}

	.alloc-pct {
		font-size: 0.6rem;
		color: #4a3f30;
		width: 26px;
		text-align: right;
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
</style>
