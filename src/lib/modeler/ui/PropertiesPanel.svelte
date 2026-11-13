<script lang="ts">
	import { store } from '../store.svelte';
	import PlanSwitcher from './PlanSwitcher.svelte';
	import { statusColor, USE_COLORS } from '../colors';
	import { M_TO_FT, ftToM, fmtSqft } from '../units';
	import type { BuildingType, CongregationProfile, DevelopmentType, Roof, Site, Status, Structure, Use } from '../types';
	import { BUILDING_TYPE_LABELS, DEVELOPMENT_TYPE_LABELS, inferBuildingType, inferDevelopmentType, zoneDwellings, zoneFloorArea } from '../metrics';

	let sidebarTab = $derived(store.sidebarTab);

	const STATUS_OPTIONS: { value: Status; label: string }[] = [
		{ value: 'existing', label: 'Existing' },
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
		{ value: 'kitchen', label: 'Kitchen' },
		{ value: 'social_services', label: 'Social services' },
		{ value: 'other', label: 'Other' },
	];

	// Proposed culture questions, drafts for the team to review (docs/PLAN.md). Answers feed
	// pattern matching.
	type CultureKey = 'partnering' | 'capacity' | 'change' | 'role';
	const CULTURE_QUESTIONS: { key: CultureKey; question: string; options: { value: string; label: string }[] }[] = [
		{
			key: 'partnering',
			question: 'Would you partner with a housing or community organization?',
			options: [{ value: 'open', label: 'Open' }, { value: 'unsure', label: 'Unsure' }, { value: 'not_now', label: 'Not now' }],
		},
		{
			key: 'capacity',
			question: 'Who would steward a project?',
			options: [{ value: 'volunteers', label: 'Volunteers' }, { value: 'some_staff', label: 'Some staff' }, { value: 'staffed', label: 'Dedicated staff' }],
		},
		{
			key: 'change',
			question: 'How much change to the property feels right?',
			options: [{ value: 'preserve', label: 'Preserve' }, { value: 'adapt', label: 'Adapt' }, { value: 'transform', label: 'Transform' }],
		},
		{
			key: 'role',
			question: 'What role do you want in the neighborhood?',
			options: [{ value: 'gathering', label: 'Gathering place' }, { value: 'service', label: 'Service provider' }, { value: 'housing_partner', label: 'Housing partner' }],
		},
	];

	const SITE_TYPES: { value: NonNullable<Site['siteType']>; label: string }[] = [
		{ value: 'urban', label: 'Urban' },
		{ value: 'suburban', label: 'Suburban' },
		{ value: 'rural', label: 'Rural' },
	];

	const ROOF_OPTIONS: { value: Roof; label: string }[] = [
		{ value: 'flat', label: 'Flat' },
		{ value: 'gable', label: 'Gable' },
		{ value: 'object', label: 'Object' },
	];

	let structures = $derived(store.plan.structures);

	// Reuse zones: which one is open for editing, and a pending status change that would drop zones
	let openZoneId = $state('');
	let confirmStatus = $state<{ id: string; status: Status } | null>(null);

	function setStatus(s: Structure, status: Status) {
		if (status !== 'existing' && s.reuseZones?.length) confirmStatus = { id: s.id, status };
		else store.updateStructure(s.id, { status });
	}

	function floorOptions(s: Structure): { value: number; label: string }[] {
		const floors = Array.from({ length: s.stories }, (_, i) => ({ value: i + 1, label: `Floor ${i + 1}` }));
		return s.basement ? [{ value: 0, label: 'Basement' }, ...floors] : floors;
	}

	function floorsLabel([from, to]: [number, number]): string {
		const name = (f: number) => (f === 0 ? 'Basement' : String(f));
		if (from === to) return from === 0 ? 'Basement' : `Floor ${from}`;
		return `Floors ${name(from)}–${name(to)}`;
	}
	let inferredType = $derived(inferBuildingType(store.plan, store.site));

	const FRONT_OPTIONS: { value: NonNullable<Site['mainBuildingFront']>; label: string }[] = [
		{ value: 'clear', label: 'Yes' },
		{ value: 'none', label: 'No' },
		{ value: 'several', label: 'Several fronts' },
	];
	let effectiveType = $derived(store.plan.buildingTypeOverride ?? inferredType);
	const BUILDING_TYPES = Object.keys(BUILDING_TYPE_LABELS) as BuildingType[];
	let inferredDevelopment = $derived(inferDevelopmentType(store.plan));
	let effectiveDevelopment = $derived(store.plan.developmentTypeOverride ?? inferredDevelopment);
	const DEVELOPMENT_TYPES = Object.keys(DEVELOPMENT_TYPE_LABELS) as DevelopmentType[];
	let selectedOS = $derived(store.selectedOpenSpace);

	// Track which structure is expanded — syncs when canvas selection changes
	let expandedId = $state('');
	$effect(() => {
		if (store.activeStructureId) {
			expandedId = store.activeStructureId;
		}
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
		const s = store.plan.structures.find((s) => s.id === structureId);
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
	<div class="site-name-row">
		<input
			class="site-name-input"
			type="text"
			aria-label="Site name"
			placeholder="Untitled Site"
			disabled={store.readOnly}
			value={store.site.name}
			oninput={(e) => store.updateSiteName((e.target as HTMLInputElement).value)}
		/>
	</div>
	<PlanSwitcher />

	<div class="tab-strip" role="tablist">
		<button
			class="tab-btn"
			class:tab-btn--active={sidebarTab === 'spatial'}
			role="tab"
			aria-selected={sidebarTab === 'spatial'}
			onclick={() => { store.sidebarTab = 'spatial'; }}
		>Spatial</button>
		<button
			class="tab-btn"
			class:tab-btn--active={sidebarTab === 'social'}
			role="tab"
			aria-selected={sidebarTab === 'social'}
			onclick={() => { store.sidebarTab = 'social'; }}
		>Social</button>
	</div>

	{#if sidebarTab === 'social'}
		{@const profile = store.site.congregationProfile ?? {}}
		<div class="section section--props">
			<h2 class="panel-heading">Congregation</h2>
			<fieldset class="ro-wrap" disabled={store.readOnly}>

			<fieldset class="fieldset">
				<legend class="field-label">Size</legend>
				<div class="pill-group">
					{#each (['small', 'medium', 'large'] as const) as size}
						<button
							class="pill"
							class:pill--active={profile.size === size}
							style={profile.size === size ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
							onclick={() => store.updateCongregationProfile({ size: profile.size === size ? undefined : size })}
						>{size.charAt(0).toUpperCase() + size.slice(1)}</button>
					{/each}
				</div>
			</fieldset>

			<label class="field-label" for="profile-tradition">Denomination / tradition</label>
			<input
				id="profile-tradition"
				class="text-input"
				type="text"
				placeholder="e.g. Roman Catholic, AME"
				value={profile.tradition ?? ''}
				oninput={(e) => store.updateCongregationProfile({ tradition: (e.target as HTMLInputElement).value || undefined })}
			/>

			<fieldset class="fieldset">
				<legend class="field-label">Tenure in building</legend>
				<div class="pill-group">
					{#each (['new', 'recent', 'established', 'historic'] as const) as tenure}
						<button
							class="pill"
							class:pill--active={profile.tenure === tenure}
							style={profile.tenure === tenure ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
							onclick={() => store.updateCongregationProfile({ tenure: profile.tenure === tenure ? undefined : tenure })}
						>{tenure.charAt(0).toUpperCase() + tenure.slice(1)}</button>
					{/each}
				</div>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="field-label">Ownership</legend>
				<div class="pill-group">
					{#each (['owned', 'leased'] as const) as own}
						<button
							class="pill"
							class:pill--active={profile.ownership === own}
							style={profile.ownership === own ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
							onclick={() => store.updateCongregationProfile({ ownership: profile.ownership === own ? undefined : own })}
						>{own.charAt(0).toUpperCase() + own.slice(1)}</button>
					{/each}
				</div>
			</fieldset>

			{#each CULTURE_QUESTIONS as q (q.key)}
				<fieldset class="fieldset">
					<legend class="field-label culture-question">{q.question}</legend>
					<div class="pill-group">
						{#each q.options as opt (opt.value)}
							{@const on = profile[q.key] === opt.value}
							<button
								class="pill"
								class:pill--active={on}
								aria-pressed={on}
								style={on ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
								onclick={() => store.updateCongregationProfile({ [q.key]: on ? undefined : opt.value } as Partial<CongregationProfile>)}
							>{opt.label}</button>
						{/each}
					</div>
				</fieldset>
			{/each}

			<label class="field-label" for="profile-notes">Notes</label>
			<textarea
				id="profile-notes"
				class="text-input textarea-input"
				placeholder="Any additional context..."
				value={profile.notes ?? ''}
				oninput={(e) => store.updateCongregationProfile({ notes: (e.target as HTMLTextAreaElement).value || undefined })}
			></textarea>
			</fieldset>
		</div>
	{/if}

	{#if sidebarTab === 'spatial'}
	<div class="section section--site-type">
		<h2 class="panel-heading">Site type</h2>
		<fieldset class="ro-wrap" disabled={store.readOnly}>
			<div class="pill-group" role="group" aria-label="Site type">
				{#each SITE_TYPES as t (t.value)}
					{@const on = store.site.siteType === t.value}
					<button
						class="pill"
						class:pill--active={on}
						aria-pressed={on}
						style={on ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
						onclick={() => store.setSiteType(on ? undefined : t.value)}
					>{t.label}</button>
				{/each}
			</div>
			{#if store.suggestedSiteType}
				<p class="field-hint site-type-hint">Suggested from the neighborhood: {store.suggestedSiteType}</p>
			{/if}
		</fieldset>
	</div>

	<div class="section section--site-type">
		<h2 class="panel-heading">Building type</h2>
		<fieldset class="ro-wrap" disabled={store.readOnly}>
			<div class="pill-group" role="group" aria-label="Building type">
				{#each BUILDING_TYPES as t (t)}
					{@const on = effectiveType === t}
					<button
						class="pill"
						class:pill--active={on}
						aria-pressed={on}
						style={on ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
						onclick={() => store.setBuildingTypeOverride(t === inferredType ? undefined : t)}
					>{BUILDING_TYPE_LABELS[t]}</button>
				{/each}
			</div>
			<fieldset class="fieldset front-question">
				<legend class="field-label culture-question">Does the main building have a clear front?</legend>
				<div class="pill-group">
					{#each FRONT_OPTIONS as opt (opt.value)}
						{@const on = store.site.mainBuildingFront === opt.value}
						<button
							class="pill"
							class:pill--active={on}
							aria-pressed={on}
							style={on ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
							onclick={() => store.setMainBuildingFront(on ? undefined : opt.value)}
						>{opt.label}</button>
					{/each}
				</div>
			</fieldset>
			{#if store.plan.buildingTypeOverride && inferredType && store.plan.buildingTypeOverride !== inferredType}
				<p class="field-hint site-type-hint">
					Inferred: {BUILDING_TYPE_LABELS[inferredType]}.
					<button class="link-btn" onclick={() => store.setBuildingTypeOverride(undefined)}>Use inferred</button>
				</p>
			{:else if inferredType}
				<p class="field-hint site-type-hint">Inferred from the structures</p>
			{:else}
				<p class="field-hint site-type-hint">Add structures to infer a type</p>
			{/if}
		</fieldset>
	</div>

	<div class="section section--site-type">
		<h2 class="panel-heading">Development type</h2>
		<fieldset class="ro-wrap" disabled={store.readOnly}>
			<div class="pill-group" role="group" aria-label="Development type">
				{#each DEVELOPMENT_TYPES as t (t)}
					{@const on = effectiveDevelopment === t}
					<button
						class="pill"
						class:pill--active={on}
						aria-pressed={on}
						style={on ? 'background:var(--fh-dusk);border-color:var(--fh-dusk);color:#fff' : ''}
						onclick={() => store.setDevelopmentTypeOverride(t === inferredDevelopment ? undefined : t)}
					>{DEVELOPMENT_TYPE_LABELS[t]}</button>
				{/each}
			</div>
			{#if store.plan.developmentTypeOverride && inferredDevelopment && store.plan.developmentTypeOverride !== inferredDevelopment}
				<p class="field-hint site-type-hint">
					Inferred: {DEVELOPMENT_TYPE_LABELS[inferredDevelopment]}.
					<button class="link-btn" onclick={() => store.setDevelopmentTypeOverride(undefined)}>Use inferred</button>
				</p>
			{:else if inferredDevelopment}
				<p class="field-hint site-type-hint">Inferred from the plan</p>
			{:else}
				<p class="field-hint site-type-hint">Add structures to infer a type</p>
			{/if}
		</fieldset>
	</div>

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
								<fieldset class="ro-wrap" disabled={store.readOnly}>
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
												onclick={() => setStatus(s, opt.value)}
											>{opt.label}</button>
										{/each}
									</div>
									{#if confirmStatus?.id === s.id}
										{@const n = s.reuseZones?.length ?? 0}
										<p class="field-hint confirm-hint">
											Reuse happens in existing buildings. This drops its {n} reuse zone{n === 1 ? '' : 's'}.
											<span class="action-row">
												<button class="delete-btn" onclick={() => { store.updateStructure(s.id, { status: confirmStatus!.status }); confirmStatus = null; }}>Change</button>
												<button class="split-btn" onclick={() => (confirmStatus = null)}>Cancel</button>
											</span>
										</p>
									{/if}
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

								{#if s.uses.includes('housing')}
									<div class="field-group">
										<label class="field-label" for="struct-dwellings-{s.id}">Housing units</label>
										<input
											id="struct-dwellings-{s.id}"
											class="num-input"
											type="number"
											min="0"
											max="999"
											placeholder="0"
											value={s.dwellings ?? ''}
											oninput={(e) => {
												const v = (e.target as HTMLInputElement).value;
												store.updateStructure(s.id, { dwellings: v ? Number(v) : undefined });
											}}
										/>
										<span class="field-hint">est. 2.5 persons / unit</span>
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
										<label class="field-label" for="struct-floor-{s.id}">Floor ht (ft)</label>
										<input
											id="struct-floor-{s.id}"
											class="num-input"
											type="number"
											min="5"
											max="66"
											step="0.5"
											value={+(s.floorHeight * M_TO_FT).toFixed(1)}
											oninput={(e) => store.updateStructure(s.id, { floorHeight: ftToM(Number((e.target as HTMLInputElement).value)) })}
										/>
									</div>
								</div>

								{#if s.heightSource === 'default'}
									<p class="field-hint height-hint height-hint--confirm">Default height. Confirm the stories.</p>
								{:else if s.heightSource === 'data'}
									<p class="field-hint height-hint">Height from map data</p>
								{/if}

								<label class="use-label basement-label">
									<input
										type="checkbox"
										checked={s.basement ?? false}
										onchange={(e) => store.updateStructure(s.id, { basement: (e.target as HTMLInputElement).checked || undefined })}
									/>
									Basement
									<span class="field-hint basement-hint">+1 below-grade floor to GFA</span>
								</label>

								<label class="field-label" for="struct-roof-{s.id}">Roof</label>
								<select
									id="struct-roof-{s.id}"
									class="select-input"
									value={s.roof}
									onchange={(e) => store.updateStructure(s.id, { roof: (e.target as HTMLSelectElement).value as Roof })}
								>
									{#each ROOF_OPTIONS as opt (opt.value)}
										{@const noGable = s.parts.some(p => p.shape === 'tri' || p.shape === 'circle' || p.shape === 'poly')}
										{#if !(opt.value === 'gable' && noGable)}
											<option value={opt.value}>{opt.label}</option>
										{/if}
									{/each}
								</select>

								{#if s.status === 'existing'}
									{@const zones = s.reuseZones ?? []}
									<div class="reuse-section" aria-label="Reuse">
										<span class="field-label">Reuse</span>
										{#each zones as z (z.id)}
											{@const open = openZoneId === z.id}
											<button class="zone-row" aria-expanded={open} onclick={() => (openZoneId = open ? '' : z.id)}>
												<span class="zone-swatch" aria-hidden="true"></span>
												<span class="zone-floors">{floorsLabel(z.floors)}</span>
												<span class="zone-use">{USE_OPTIONS.find((o) => o.value === z.use)?.label ?? z.use}</span>
												<span class="zone-area">{fmtSqft(zoneFloorArea(z, s))}</span>
											</button>
											{#if open}
												<div class="zone-props">
													<div class="row-fields">
														<label class="field-group">
															<span class="field-label">From</span>
															<select class="select-input" value={z.floors[0]} onchange={(e) => store.updateZone(z.id, { floors: [Number((e.target as HTMLSelectElement).value), z.floors[1]] })}>
																{#each floorOptions(s) as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
															</select>
														</label>
														<label class="field-group">
															<span class="field-label">To</span>
															<select class="select-input" value={z.floors[1]} onchange={(e) => store.updateZone(z.id, { floors: [z.floors[0], Number((e.target as HTMLSelectElement).value)] })}>
																{#each floorOptions(s) as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
															</select>
														</label>
													</div>
													<label class="field-label" for="zone-use-{z.id}">Proposed use</label>
													<select id="zone-use-{z.id}" class="select-input" value={z.use} onchange={(e) => store.updateZone(z.id, { use: (e.target as HTMLSelectElement).value as Use })}>
														{#each USE_OPTIONS as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
													</select>
													{#if z.use === 'housing'}
														<label class="field-label" for="zone-units-{z.id}">Housing units</label>
														<input
															id="zone-units-{z.id}"
															class="num-input"
															type="number"
															min="0"
															placeholder={String(zoneDwellings({ ...z, dwellings: undefined }, s))}
															value={z.dwellings ?? ''}
															oninput={(e) => {
																const v = (e.target as HTMLInputElement).value;
																store.updateZone(z.id, { dwellings: v ? Number(v) : undefined });
															}}
														/>
														{#if z.dwellings === undefined}<span class="field-hint">Estimated at 900 sq ft per unit</span>{/if}
													{/if}
													<button class="delete-btn zone-delete" onclick={() => store.deleteZone(z.id)}>Delete zone</button>
												</div>
											{/if}
										{/each}
										<div class="reuse-actions">
											<button class="split-btn" onclick={() => store.addWholeBuildingReuse(s.id)}>Reuse whole building</button>
											<button class="split-btn" onclick={() => store.startDrawingZone(s.id)}>Draw reuse area</button>
										</div>
									</div>
								{/if}
								<div class="action-row">
									<button class="split-btn" onclick={() => store.startCutting(s.id)} title="Cut into pieces, like additions">Cut</button>
									{#if s.groupId}
										<button class="split-btn" onclick={() => store.ungroupStructure(s.id)}>
											Ungroup
										</button>
									{/if}
									<button class="delete-btn" onclick={() => store.deleteStructure(s.id)}>Delete</button>
								</div>
								</fieldset>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{/if}

	<!-- Tree properties when one is selected -->
	{#if store.selectedTreeId && sidebarTab === 'spatial'}
		{@const tree = store.plan.trees.find(t => t.id === store.selectedTreeId)}
		{#if tree}
			<div class="section section--props">
				<h2 class="panel-heading">Tree</h2>
				<fieldset class="ro-wrap" disabled={store.readOnly}>
				<div class="row-fields">
					<div class="field-group">
						<label class="field-label" for="tree-radius">Canopy (ft)</label>
						<input
							id="tree-radius"
							class="num-input"
							type="number"
							min="1.5"
							max="66"
							step="0.5"
							value={+(tree.radius * M_TO_FT).toFixed(1)}
							oninput={(e) => {
								const v = Number((e.target as HTMLInputElement).value);
								if (v > 0) store.updateTree(tree.id, { radius: ftToM(v) });
							}}
						/>
					</div>
					<div class="field-group">
						<label class="field-label" for="tree-height">Height (ft)</label>
						<input
							id="tree-height"
							class="num-input"
							type="number"
							min="3"
							max="130"
							step="1"
							value={+(tree.height * M_TO_FT).toFixed(1)}
							oninput={(e) => {
								const v = Number((e.target as HTMLInputElement).value);
								if (v > 0) store.updateTree(tree.id, { height: ftToM(v) });
							}}
						/>
					</div>
				</div>
				<button class="delete-btn" onclick={() => store.deleteTree(tree.id)}>Delete</button>
				</fieldset>
			</div>
		{/if}
	{/if}

	<!-- Open space properties when one is selected -->
	{#if selectedOS && sidebarTab === 'spatial'}
		{@const os = selectedOS}
		<div class="section section--props">
			<h2 class="panel-heading">Open Space</h2>
			<fieldset class="ro-wrap" disabled={store.readOnly}>

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
			</fieldset>
		</div>
	{/if}
</aside>

<style>
	.section--site-type { padding-bottom: 0.6rem; }
	.front-question { margin-top: 0.5rem; }
	/* Questions are full sentences; the small caps label style reads poorly at that length */
	.culture-question { text-transform: none; letter-spacing: 0; font-weight: 600; line-height: 1.3; }

	.reuse-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0.5rem 0;
		padding-top: 0.45rem;
		border-top: 1px solid var(--color-border);
	}

	.zone-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'swatch floors area' 'swatch use area';
		column-gap: 0.4rem;
		align-items: center;
		text-align: left;
		padding: 0.25rem 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: #fff;
		font-size: 0.68rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.zone-row[aria-expanded='true'] { border-color: var(--color-reuse); }
	.zone-swatch { grid-area: swatch; width: 0.7rem; height: 0.7rem; border-radius: 2px; background: var(--color-reuse); }
	.zone-floors { grid-area: floors; font-weight: 600; }
	.zone-use { grid-area: use; color: var(--fh-stone); }
	.zone-area { grid-area: area; color: var(--fh-stone); font-variant-numeric: tabular-nums; }

	.zone-props {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.35rem;
		border-left: 2px solid var(--color-reuse);
		margin-left: 0.35rem;
	}

	.zone-delete { margin-top: 0.25rem; }

	.reuse-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.confirm-hint { display: block; margin-top: 0.3rem; color: #9a5a10; }
	.link-btn {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--color-selection);
		text-decoration: underline;
		cursor: pointer;
	}
	.site-type-hint { display: block; margin-top: 0.35rem; }
	.height-hint { display: block; margin: 0.15rem 0 0.35rem; }
	.height-hint--confirm { color: #9a5a10; }

	/* Disabled in view-only mode; otherwise invisible */
	.ro-wrap {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		display: contents;
	}

	.ro-wrap:disabled :is(.delete-btn, .split-btn, .action-row) { display: none; }
	.ro-wrap:disabled :is(input, select, textarea, button) { cursor: default; }
	.ro-wrap:disabled :is(.text-input, .num-input, .select-input) {
		background: transparent;
		border-color: transparent;
		color: var(--color-text);
		opacity: 1;
		appearance: none;
	}

	.props-panel {
		width: 220px;
		flex-shrink: 0;
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		user-select: none;
	}

	.site-name-row {
		padding: 0.5rem 0.6rem 0.15rem;
		background: var(--color-surface);
	}

	.site-name-input {
		width: 100%;
		border: none;
		background: transparent;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
		padding: 0;
		outline: none;
		caret-color: var(--color-selection);
	}

	.site-name-input:focus {
		border-bottom: 1px solid var(--color-selection);
	}

	.tab-strip {
		display: flex;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}

	.tab-btn {
		flex: 1;
		padding: 0.4rem 0;
		border: none;
		background: none;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--color-text);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: color 0.1s, border-color 0.1s;
	}

	.tab-btn:hover { color: var(--color-text); }

	.tab-btn--active {
		color: var(--color-text);
		font-weight: 700;
		border-bottom-color: var(--color-text);
		background: var(--color-surface);
	}

	.textarea-input {
		resize: vertical;
		min-height: 60px;
		font-family: inherit;
		line-height: 1.4;
	}

	.section {
		padding: 0.75rem;
		border-bottom: 1px solid var(--color-border);
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
		color: var(--color-text);
		margin: 0 0 0.5rem;
	}

	.empty-hint {
		font-size: 0.65rem;
		color: var(--color-text);
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
		border: 1px solid var(--color-border);
		background: var(--color-surface);
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
		color: var(--color-text);
		text-align: left;
		border-radius: 3px;
	}

	.struct-row:hover { background: rgba(0 0 0 / 0.05); }
	.struct-row--active { font-weight: 600; }

	.caret {
		font-size: 0.5rem;
		color: var(--color-text);
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
		color: var(--color-text);
		flex-shrink: 0;
		line-height: 1;
	}

	.struct-props {
		padding: 0.5rem 0.6rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		border-top: 1px solid var(--color-border);
	}

	.field-label {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text);
		display: block;
		margin-bottom: 0.15rem;
	}

	.text-input, .select-input {
		width: 100%;
		padding: 0.25rem 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: #fff;
		font-size: 0.72rem;
		color: var(--color-text);
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
		border: 1px solid var(--color-border);
		border-radius: 10px;
		background: #fff;
		font-size: 0.62rem;
		cursor: pointer;
		color: var(--color-text);
	}

	.pill:hover { border-color: var(--color-text); }
	.pill--active { font-weight: 600; }

	.uses-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.15rem 0.4rem;
	}

	.use-label {
		font-size: 0.68rem;
		color: var(--color-text);
		display: flex;
		align-items: center;
		gap: 0.2rem;
		cursor: pointer;
		user-select: none;
	}

	.use-label input[type='checkbox'] {
		accent-color: var(--color-selection);
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
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: #fff;
		font-size: 0.72rem;
		color: var(--color-text);
	}

	.num-input:focus { outline: 2px solid var(--color-selection); border-color: transparent; }

	.field-hint {
		font-size: 0.6rem;
		color: var(--color-text);
		opacity: 0.6;
		margin-top: 0.1rem;
		display: block;
	}

	.basement-label {
		align-items: baseline;
		gap: 0.3rem;
	}

	.basement-hint {
		display: inline;
		margin-top: 0;
		margin-left: 0.1rem;
	}

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
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		color: var(--color-text);
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
		color: var(--color-text);
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
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
		background: var(--color-border);
		border-radius: 2px;
		outline: none;
	}

	.alloc-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-text);
		cursor: pointer;
	}

	.alloc-slider::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-text);
		cursor: pointer;
		border: none;
	}

	.alloc-pct {
		font-size: 0.6rem;
		color: var(--color-text);
		width: 26px;
		text-align: right;
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
</style>
