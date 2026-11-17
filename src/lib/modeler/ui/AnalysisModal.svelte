<script lang="ts" module>
	// Shared by every instance of the modal
	const patternsVersion = $state({ n: 0 });
</script>

<script lang="ts">
	import { store } from '../store.svelte';
	import './report.css';

	interface Props { previousViewMode?: 'plan' | '3d' }
	let { previousViewMode = 'plan' }: Props = $props();

	function close() {
		store.showAnalysis = false;
		store.viewMode = previousViewMode;
	}

	// Restore view mode if the component is destroyed via any path.
	$effect(() => () => { store.viewMode = previousViewMode; });
	import { addedStories, totalStories } from '../geometry';
	import { capturePlanImage } from '../sceneExport';
	import { saveSite } from './SiteBar.svelte';
	import { page } from '$app/state';
	import { planUrl } from '../api';
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
		reuseZoneCount,
		reuseFloorArea,
		keptPlan,
		polygonArea,
		saleArea,
		soldStructures,
	} from '../metrics';
	import type { Use } from '../types';
	import { creditLine } from '../credits';
	import { getPatterns, type Pattern } from '../../patterns/catalog';
	import { patternFor } from '../../patterns/match';
	import PatternCard from './PatternCard.svelte';
	import ReportNotes from './ReportNotes.svelte';
	import ActionSteps from './ActionSteps.svelte';
	import UseAllocation from './UseAllocation.svelte';

	const USE_LABELS: Record<Use, string> = {
		worship: 'Worship', fellowship: 'Fellowship', education: 'Education',
		office: 'Office', housing: 'Housing', community: 'Community',
		daycare: 'Daycare', kitchen: 'Kitchen', social_services: 'Social services', other: 'Other',
	};

	const STATUS_LABELS = {
		existing: 'Existing', new: 'New', removed: 'To be removed',
	};

	const TENURE_LABELS = {
		new: 'New', recent: 'Recent', established: 'Established', historic: 'Historic',
	};

	let site = $derived(store.site);
	let plan = $derived(store.plan);
	let profile = $derived(site.congregationProfile ?? {});

	// Measured on what the congregation keeps: land to sell and the buildings on it leave
	let kept = $derived(keptPlan(plan));
	let sold = $derived(plan.structures.filter((s) => soldStructures(plan).has(s.id)));
	let landSold = $derived(saleArea(plan));
	let parcelArea = $derived(site.parcel && site.parcel.length >= 3 ? polygonArea(site.parcel) : 0);
	let footprint = $derived(siteFootprint(kept));
	let gfa = $derived(grossFloorArea(kept));
	let coverage = $derived(lotCoverage(plan, site));
	let osArea = $derived(openSpaceArea(kept));
	let green = $derived(greenSpaceArea(kept));
	let parking = $derived(parkingArea(kept));
	let dwellings = $derived(dwellingsEstimate(kept));
	let dwellingStatus = $derived(dwellingsByStatus(kept));
	let useAreas = $derived(useFloorAreaByUse(kept));
	let steps = $derived(generateActionSteps(plan, site));

	let storiesMin = $derived(
		kept.structures.length ? Math.min(...kept.structures.map((s) => totalStories(s))) : 0
	);
	let storiesMax = $derived(
		kept.structures.length ? Math.max(...kept.structures.map((s) => totalStories(s))) : 0
	);

	let reuseZones = $derived(reuseZoneCount(kept));
	let reuseArea = $derived(reuseFloorArea(kept));

	// The pattern matrix: the catalog loads async (Directus later), the matching is pure
	let patterns = $state<Pattern[]>([]);
	$effect(() => {
		void patternsVersion.n; // reloads after pegging an example
		getPatterns().then((p) => (patterns = p));
	});
	let found = $derived(patternFor(site, plan, patterns));
	let cellPattern = $derived(found.pattern);

	// Until the CMS runs, the team pegs a modeled plan as its pattern's example from here
	let pegState = $state<'idle' | 'saving' | 'failed'>('idle');
	let isExample = $derived(
		!!cellPattern?.example && store.isPersisted && cellPattern.example.url === planUrl(store.siteSlug, store.onSite ? '' : store.plan.slug, true),
	);
	async function pegExample() {
		if (!cellPattern) return;
		pegState = 'saving';
		try {
			if (!(await saveSite())) throw new Error('save failed');
			const res = await fetch(`/api/patterns/${cellPattern.slug}/example`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ siteId: store.site.id, planId: store.onSite ? null : store.plan.id }),
			});
			if (!res.ok) throw new Error(`peg failed: ${res.status}`);
			// A first save moves to the site's URL and may remount this modal: bump the shared
			// version so whichever instance is showing reloads the catalog
			patternsVersion.n++;
			pegState = 'idle';
		} catch (e) {
			console.error(e);
			pegState = 'failed';
		}
	}

	let statusCounts = $derived.by(() => {
		const counts = { existing: 0, new: 0, removed: 0 };
		for (const s of kept.structures) counts[s.status]++;
		return counts;
	});

	let useAreaEntries = $derived(
		(Object.entries(useAreas) as [Use, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
	);

	const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

	let planImageSrc = $state<string | null>(null);
	$effect(() => { planImageSrc = capturePlanImage(plan, plan.annotations); });

	function pct(n: number, total: number): string {
		return total > 0 ? Math.round((n / total) * 100) + '%' : '—';
	}
</script>

<div class="report analysis-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
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
					{#if buildingType(plan, site)}
						{@const bt = buildingType(plan, site)!}
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
							<span class="overview-label">Context</span>
							<span class="overview-value">{profile.notes}</span>
						</div>
					{/if}
				</div>
				{#if planImageSrc}
					<img class="overview-plan" src={planImageSrc} alt="Site plan" />
				{/if}
				</div>
				<!-- The plan's notes, numbered as on the plan image, as the pattern book does -->
				<ReportNotes notes={plan.annotations} />
			</section>

			<!-- Your pattern: the site's cell in the matrix, and the pattern written for it -->
			{#if patterns.length}
				<section class="report-section" aria-label="Your pattern">
					<h2 class="section-heading">Your pattern</h2>
					<PatternCard found={found}>
						{#if isExample}
							<p class="pattern-variant peg-note">This plan is the pattern's example.</p>
						{:else if !store.readOnly && (page.data.user as { isTeam?: boolean } | null)?.isTeam}
							<button class="peg-btn" onclick={pegExample} disabled={pegState === 'saving'}>
								{pegState === 'saving' ? 'Saving' : "Use this plan as the pattern's example"}
							</button>
							{#if pegState === 'failed'}<p class="pattern-variant peg-note">Could not set the example. Try again.</p>{/if}
						{/if}
					</PatternCard>
				</section>
			{/if}

			<!-- Spatial Metrics -->
			<section class="report-section">
				<h2 class="section-heading">Spatial Metrics</h2>
				<table class="metrics-table">
					<tbody>
						<tr><td class="met-label">Structure footprint</td><td class="met-value">{fmtSqft(footprint)}</td></tr>
						<tr><td class="met-label">Gross floor area</td><td class="met-value">{fmtSqft(gfa)}</td></tr>
						{#if reuseArea > 0}
							<tr><td class="met-label">Adaptive reuse</td><td class="met-value">{fmtSqft(reuseArea)} <span class="met-sub">{pct(reuseArea, gfa)} of floor area</span></td></tr>
						{/if}
						{#if landSold > 0}
							<tr>
								<td class="met-label">Land to sell</td>
								<td class="met-value">
									{fmtSqft(landSold)}
									{#if parcelArea}<span class="met-sub">{pct(landSold, parcelArea)} of the property</span>{/if}
									{#if sold.length}<span class="met-sub met-sub--block">Sold with it: {sold.filter((s) => !s.onRoofOf).map((s) => s.label || 'Structure').join(', ')}</span>{/if}
								</td>
							</tr>
						{/if}
						<tr><td class="met-label">Lot coverage</td><td class="met-value">{coverage !== null ? Math.round(coverage) + '%' : '—'}</td></tr>
						<tr><td class="met-label">Structures</td>
							<td class="met-value">
								{plan.structures.length}
								{#if plan.structures.length > 0}
									<span class="met-sub">
										{[
											statusCounts.existing && `${statusCounts.existing} existing`,
											statusCounts.new && `${statusCounts.new} new`,
											reuseZones && `${reuseZones} reuse zone${reuseZones === 1 ? '' : 's'}`,
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
					<UseAllocation areas={useAreas} />
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
									<td>{s.stories}{addedStories(s) ? ` +${addedStories(s)}` : ''}{s.basement ? ' +B' : ''}{s.onRoofOf ? ' on roof' : ''}</td>
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
					<ActionSteps {steps} />
				</section>
			{/if}

			{#if creditLine(site.context)}
				<p class="credits-line">{creditLine(site.context)}</p>
			{/if}

		</div><!-- /.analysis-modal__body -->

		<div class="analysis-modal__footer">
			<button class="print-btn" onclick={() => window.print()}>Print / Save as PDF</button>
		</div>
	</div>
</div>
