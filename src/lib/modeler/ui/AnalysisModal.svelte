<script lang="ts">
	import { store } from '../store.svelte';

	interface Props { previousViewMode?: 'plan' | '3d' }
	let { previousViewMode = 'plan' }: Props = $props();

	function close() {
		store.showAnalysis = false;
		store.viewMode = previousViewMode;
	}

	// Restore view mode if the component is destroyed via any path.
	$effect(() => () => { store.viewMode = previousViewMode; });
	import { USE_COLORS } from '../colors';
	import { capturePlanImage } from '../sceneExport';
	import { fmtSqft, AVG_UNIT_SQFT } from '../units';
	import {
		siteFootprint,
		grossFloorArea,
		lotCoverage,
		openSpaceArea,
		greenSpaceArea,
		parkingArea,
		dwellingsEstimate,
		dwellingsByStatus,
		useFloorAreaByUse,
		structureFootprint,
		generateActionSteps,
		buildingType,
		BUILDING_TYPE_LABELS,
	} from '../metrics';
	import type { Use } from '../types';

	const USE_LABELS: Record<Use, string> = {
		worship: 'Worship', fellowship: 'Fellowship', education: 'Education',
		office: 'Office', housing: 'Housing', community: 'Community',
		daycare: 'Daycare', kitchen: 'Kitchen', social_services: 'Social services', other: 'Other',
	};

	const STATUS_LABELS = {
		existing: 'Existing', adaptive_reuse: 'Reuse', new: 'New', removed: 'Removed',
	};

	const TENURE_LABELS = {
		new: 'New', recent: 'Recent', established: 'Established', historic: 'Historic',
	};

	let site = $derived(store.site);
	let plan = $derived(store.plan);
	let profile = $derived(site.congregationProfile ?? {});

	let footprint = $derived(siteFootprint(plan));
	let gfa = $derived(grossFloorArea(plan));
	let coverage = $derived(lotCoverage(plan, site));
	let osArea = $derived(openSpaceArea(plan));
	let green = $derived(greenSpaceArea(plan));
	let parking = $derived(parkingArea(plan));
	let dwellings = $derived(dwellingsEstimate(plan));
	let dwellingStatus = $derived(dwellingsByStatus(plan));
	let useAreas = $derived(useFloorAreaByUse(plan));
	let steps = $derived(generateActionSteps(plan, site));

	let storiesMin = $derived(
		plan.structures.length ? Math.min(...plan.structures.map((s) => s.stories)) : 0
	);
	let storiesMax = $derived(
		plan.structures.length ? Math.max(...plan.structures.map((s) => s.stories)) : 0
	);

	let statusCounts = $derived.by(() => {
		const counts = { existing: 0, adaptive_reuse: 0, new: 0, removed: 0 };
		for (const s of plan.structures) counts[s.status]++;
		return counts;
	});

	let useAreaTotal = $derived(Object.values(useAreas).reduce((a, b) => a + (b ?? 0), 0));

	let useAreaEntries = $derived(
		(Object.entries(useAreas) as [Use, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
	);

	let flagSteps = $derived(steps.filter((s) => s.severity === 'flag'));
	let suggestSteps = $derived(steps.filter((s) => s.severity === 'suggest'));
	let infoSteps = $derived(steps.filter((s) => s.severity === 'info'));

	const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

	let planImageSrc = $state<string | null>(null);
	$effect(() => { planImageSrc = capturePlanImage(plan); });

	function pct(n: number, total: number): string {
		return total > 0 ? Math.round((n / total) * 100) + '%' : '—';
	}
</script>

<div class="analysis-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
	<div class="analysis-modal" role="dialog" aria-modal="true" aria-label="Site analysis">
		<div class="analysis-modal__toolbar">
			<span class="modal-title">Site Analysis</span>
			<button class="modal-close" onclick={close} aria-label="Close">✕</button>
		</div>

		<div class="analysis-modal__body">

			<!-- Site Overview -->
			<section class="report-section">
				<h2 class="section-heading">Site Overview</h2>
				<div class="overview-with-plan">
				<div class="overview-grid">
					<div class="overview-row">
						<span class="overview-label">Site</span>
						<span class="overview-value">{site.name || 'Untitled Site'}</span>
					</div>
					{#if site.siteType}
						<div class="overview-row">
							<span class="overview-label">Type</span>
							<span class="type-badge type-badge--{site.siteType}">{site.siteType.charAt(0).toUpperCase() + site.siteType.slice(1)}</span>
						</div>
					{/if}
					{#if buildingType(plan)}
						{@const bt = buildingType(plan)!}
						<div class="overview-row">
							<span class="overview-label">Building</span>
							<span class="type-badge type-badge--building">{BUILDING_TYPE_LABELS[bt]}</span>
						</div>
					{/if}
					<div class="overview-row">
						<span class="overview-label">Report date</span>
						<span class="overview-value">{dateStr}</span>
					</div>
					{#if profile.tradition}
						<div class="overview-row">
							<span class="overview-label">Tradition</span>
							<span class="overview-value">{profile.tradition}</span>
						</div>
					{/if}
					{#if profile.size}
						<div class="overview-row">
							<span class="overview-label">Congregation</span>
							<span class="overview-value">{profile.size.charAt(0).toUpperCase() + profile.size.slice(1)}</span>
						</div>
					{/if}
					{#if profile.tenure}
						<div class="overview-row">
							<span class="overview-label">Tenure</span>
							<span class="overview-value">{TENURE_LABELS[profile.tenure]}</span>
						</div>
					{/if}
					{#if profile.ownership}
						<div class="overview-row">
							<span class="overview-label">Ownership</span>
							<span class="overview-value">{profile.ownership.charAt(0).toUpperCase() + profile.ownership.slice(1)}</span>
						</div>
					{/if}
					{#if profile.notes}
						<div class="overview-row overview-row--notes">
							<span class="overview-label">Notes</span>
							<span class="overview-value">{profile.notes}</span>
						</div>
					{/if}
				</div>
				{#if planImageSrc}
					<img class="overview-plan" src={planImageSrc} alt="Site plan" />
				{/if}
				</div>
			</section>

			<!-- Spatial Metrics -->
			<section class="report-section">
				<h2 class="section-heading">Spatial Metrics</h2>
				<table class="metrics-table">
					<tbody>
						<tr><td class="met-label">Structure footprint</td><td class="met-value">{fmtSqft(footprint)}</td></tr>
						<tr><td class="met-label">Gross floor area</td><td class="met-value">{fmtSqft(gfa)}</td></tr>
						<tr><td class="met-label">Lot coverage</td><td class="met-value">{coverage !== null ? Math.round(coverage) + '%' : '—'}</td></tr>
						<tr><td class="met-label">Structures</td>
							<td class="met-value">
								{plan.structures.length}
								{#if plan.structures.length > 0}
									<span class="met-sub">
										{[
											statusCounts.existing && `${statusCounts.existing} existing`,
											statusCounts.adaptive_reuse && `${statusCounts.adaptive_reuse} reuse`,
											statusCounts.new && `${statusCounts.new} new`,
										].filter(Boolean).join(', ')}
									</span>
								{/if}
							</td>
						</tr>
						<tr><td class="met-label">Stories range</td><td class="met-value">{storiesMin === storiesMax ? storiesMin : `${storiesMin}–${storiesMax}`}</td></tr>
						<tr>
								<td class="met-label">Housing units</td>
								<td class="met-value">
									{dwellings > 0 ? dwellings : '—'}
									{#if dwellings > 0}
										{#if dwellingStatus.adaptive_reuse > 0}
											<span class="met-sub met-sub--block">{dwellingStatus.adaptive_reuse} adaptive reuse</span>
										{/if}
										{#if dwellingStatus.new > 0}
											<span class="met-sub met-sub--block">{dwellingStatus.new} new construction</span>
										{/if}
										{#if dwellingStatus.existing > 0}
											<span class="met-sub met-sub--block">{dwellingStatus.existing} existing</span>
										{/if}
										<span class="met-sub met-sub--block">est. {Math.round(dwellings * 2.5)} residents</span>
										<span class="met-sub met-sub--block">est. {(dwellings * AVG_UNIT_SQFT).toLocaleString()} sq ft <span class="met-hint">avg {AVG_UNIT_SQFT} sq ft/unit</span></span>
									{/if}
								</td>
							</tr>
						<tr><td class="met-label">Total open space</td><td class="met-value">{fmtSqft(osArea)}</td></tr>
						<tr><td class="met-label">Green space</td><td class="met-value">{fmtSqft(green)} <span class="met-sub">{osArea > 0 ? pct(green, osArea) : ''}</span></td></tr>
						<tr><td class="met-label">Parking</td><td class="met-value">{fmtSqft(parking)}</td></tr>
					</tbody>
				</table>
			</section>

			<!-- Use Allocation -->
			{#if useAreaEntries.length > 0}
				<section class="report-section">
					<h2 class="section-heading">Use Allocation (site-wide)</h2>
					<div class="alloc-bar" aria-hidden="true">
						{#each useAreaEntries as [use, area]}
							<div class="alloc-seg" style="width:{useAreaTotal > 0 ? (area / useAreaTotal) * 100 : 0}%;background:{USE_COLORS[use]}"></div>
						{/each}
					</div>
					<div class="alloc-rows">
						{#each useAreaEntries as [use, area]}
							<div class="alloc-row">
								<span class="alloc-dot" style="background:{USE_COLORS[use]}"></span>
								<span class="alloc-name">{USE_LABELS[use]}</span>
								<span class="alloc-area">{fmtSqft(area)}</span>
								<span class="alloc-pct">{pct(area, useAreaTotal)}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Structure Inventory -->
			{#if plan.structures.length > 0}
				<section class="report-section">
					<h2 class="section-heading">Structure Inventory</h2>
					<table class="inventory-table">
						<thead>
							<tr>
								<th>Label</th>
								<th>Status</th>
								<th>Roof</th>
								<th>Stories</th>
								<th>Uses</th>
								<th>Footprint</th>
							</tr>
						</thead>
						<tbody>
							{#each plan.structures as s (s.id)}
								<tr>
									<td>{s.label}</td>
									<td>{STATUS_LABELS[s.status]}</td>
									<td>{s.roof.charAt(0).toUpperCase() + s.roof.slice(1)}</td>
									<td>{s.stories}{s.basement ? ' +B' : ''}</td>
									<td class="uses-cell">{s.uses.map((u) => USE_LABELS[u]).join(', ') || '—'}</td>
									<td>{fmtSqft(structureFootprint(s))}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
			{/if}

			<!-- Action Steps -->
			{#if steps.length > 0}
				<section class="report-section">
					<h2 class="section-heading">Action Steps</h2>
					<div class="steps-list">
						{#each flagSteps as step}
							<div class="step step--flag">
								<span class="step-chip step-chip--flag">{step.category}</span>
								<span class="step-msg">{step.message}</span>
							</div>
						{/each}
						{#each suggestSteps as step}
							<div class="step step--suggest">
								<span class="step-chip step-chip--suggest">{step.category}</span>
								<span class="step-msg">{step.message}</span>
							</div>
						{/each}
						{#each infoSteps as step}
							<div class="step step--info">
								<span class="step-chip step-chip--info">{step.category}</span>
								<span class="step-msg">{step.message}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

		</div><!-- /.analysis-modal__body -->

		<div class="analysis-modal__footer">
			<button class="print-btn" onclick={() => window.print()}>Print / Save as PDF</button>
		</div>
	</div>
</div>

<style>
	.analysis-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0 0 0 / 0.45);
		z-index: 100;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 2rem 1rem;
		overflow-y: auto;
	}

	.analysis-modal {
		width: 100%;
		max-width: 760px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0 0 0 / 0.25);
	}

	.analysis-modal__toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: 6px 6px 0 0;
	}

	.modal-title {
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text);
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1rem;
		color: var(--color-text);
		cursor: pointer;
		padding: 0.1rem 0.3rem;
		line-height: 1;
		border-radius: 3px;
	}
	.modal-close:hover { background: #e0d8cc; }

	.analysis-modal__body {
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow-y: auto;
	}

	.analysis-modal__footer {
		padding: 0.75rem 1.5rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
	}

	.print-btn {
		padding: 0.35rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-text);
		color: var(--color-surface);
		font-size: 0.75rem;
		cursor: pointer;
		font-weight: 600;
	}
	.print-btn:hover { background: #000; }

	.report-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.section-heading {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text);
		margin: 0;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid var(--color-border);
	}

	.overview-with-plan {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.overview-grid {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1;
	}

	.overview-plan {
		width: 180px;
		height: 180px;
		object-fit: contain;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-surface);
		flex-shrink: 0;
		image-rendering: pixelated;
	}

	.overview-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.overview-row--notes {
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.overview-row--notes .overview-value {
		white-space: pre-wrap;
		line-height: 1.4;
	}

	.overview-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text);
		width: 90px;
		flex-shrink: 0;
	}

	.overview-value {
		font-size: 0.8rem;
		color: var(--color-text);
	}

	.type-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.1rem 0.4rem;
		border-radius: 10px;
	}
	.type-badge--urban { background: #d4e0f0; color: #1a3a6a; }
	.type-badge--suburban { background: #e8f0d8; color: #2a4a1a; }
	.type-badge--rural { background: #f0e8d0; color: #4a3010; }
	.type-badge--building { background: var(--fh-lantern-tint); color: #5a3408; }

	.metrics-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}

	.metrics-table tr { border-bottom: 1px solid var(--color-border); }
	.metrics-table tr:last-child { border-bottom: none; }

	.met-label {
		padding: 0.3rem 0;
		color: var(--color-text);
		width: 60%;
	}

	.met-value {
		padding: 0.3rem 0;
		color: var(--color-text);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.met-sub {
		font-weight: 400;
		color: var(--color-text);
		font-size: 0.7rem;
		margin-left: 0.3rem;
	}

	.met-sub--block {
		display: block;
		margin-left: 0;
		margin-top: 2px;
	}

	.met-hint {
		opacity: 0.55;
		font-size: 0.65rem;
	}

	.alloc-bar {
		display: flex;
		height: 14px;
		border-radius: 4px;
		overflow: hidden;
		gap: 1px;
		background: #e0d8cc;
	}

	.alloc-seg {
		height: 100%;
		min-width: 2px;
	}

	.alloc-rows {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.alloc-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.alloc-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.alloc-name {
		flex: 1;
		color: var(--color-text);
	}

	.alloc-area {
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		width: 90px;
		text-align: right;
	}

	.alloc-pct {
		color: var(--color-text);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		width: 36px;
		text-align: right;
	}

	.inventory-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.72rem;
	}

	.inventory-table th {
		text-align: left;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text);
		padding: 0.2rem 0.4rem 0.3rem;
		border-bottom: 1px solid var(--color-border);
	}

	.inventory-table td {
		padding: 0.25rem 0.4rem;
		color: var(--color-text);
		border-bottom: 1px solid #ece8e0;
		vertical-align: top;
	}

	.inventory-table tr:last-child td { border-bottom: none; }

	.uses-cell {
		color: var(--color-text);
		font-size: 0.68rem;
	}

	.steps-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.step--flag { background: #fdf0f0; border-left: 3px solid #c05870; }
	.step--suggest { background: #fdf5e8; border-left: 3px solid #c08030; }
	.step--info { background: var(--color-surface); border-left: 3px solid #9a8a76; }

	.step-chip {
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.step-chip--flag { background: #c05870; color: #fff; }
	.step-chip--suggest { background: #c08030; color: #fff; }
	.step-chip--info { background: var(--fh-stone); color: #fff; }

	.step-msg { color: var(--color-text); line-height: 1.45; }
</style>
