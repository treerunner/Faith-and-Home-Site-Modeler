<script lang="ts">
	import { onMount, tick } from 'svelte';
	import './report.css';
	import { store } from '../store.svelte';
	import { capturePlanImage } from '../sceneExport';
	import { compareRows, planSummary } from '../compare';
	import { generateActionSteps, keptPlan, useFloorAreaByUse } from '../metrics';
	import { creditLine } from '../credits';
	import { getPatterns, type Pattern } from '../../patterns/catalog';
	import { cellLabel, isComplete, patternFor } from '../../patterns/match';
	import type { SceneView } from '../scene/cameraRef';
	import type { Plan } from '../types';
	import PatternCard from './PatternCard.svelte';
	import ReportNotes from './ReportNotes.svelte';
	import ActionSteps from './ActionSteps.svelte';
	import UseAllocation from './UseAllocation.svelte';

	// The single analysis, side by side: A and B's plans and notes, their patterns, one table of
	// what changed, both mixes of uses, and B's action steps. Printable the same way.
	interface Props { a: Plan; b: Plan; viewA: SceneView; viewB: SceneView; onclose: () => void }
	let { a, b, viewA, viewB, onclose }: Props = $props();

	let site = $derived(store.site);
	const nameOf = (p: Plan) => (p.id === store.site.existing.id ? p.name : p.name || 'Untitled plan');

	let rows = $derived(compareRows(planSummary(a, site), planSummary(b, site)));
	let steps = $derived(generateActionSteps(b, site));

	let patterns = $state<Pattern[]>([]);
	$effect(() => {
		getPatterns().then((p) => (patterns = p));
	});
	let foundA = $derived(patternFor(site, a, patterns));
	let foundB = $derived(patternFor(site, b, patterns));
	let sameCell = $derived(isComplete(foundA.cell) && isComplete(foundB.cell) && cellLabel(foundA.cell) === cellLabel(foundB.cell));

	// The pictures are plan view, tight on each plan with its notes: switch to plan view for the
	// capture and back on close
	let images = $state<{ a: string | null; b: string | null }>({ a: null, b: null });
	onMount(() => {
		const before = store.viewMode;
		store.viewMode = 'plan';
		tick().then(() =>
			requestAnimationFrame(() => {
				images = { a: capturePlanImage(a, a.annotations, viewA, 4 / 3), b: capturePlanImage(b, b.annotations, viewB, 4 / 3) };
			}),
		);
		return () => (store.viewMode = before);
	});

	const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
</script>

<div class="report analysis-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
	<div class="analysis-modal analysis-modal--wide" role="dialog" aria-modal="true" aria-label="Compare analysis">
		<div class="analysis-modal__toolbar">
			<span class="modal-title">Compare Analysis</span>
			<button class="modal-close" onclick={onclose} aria-label="Close">✕</button>
		</div>

		<div class="analysis-modal__body">
			<section class="report-section">
				<h2 class="section-heading">{site.name || 'Untitled Site'}</h2>
				<p class="compare-date">{dateStr}</p>
				<div class="columns">
					{#each [{ side: 'A', plan: a, src: images.a }, { side: 'B', plan: b, src: images.b }] as c (c.side)}
						<div class="column">
							<p class="column-head"><span class="side">{c.side}</span> {nameOf(c.plan)}</p>
							{#if c.src}<img class="compare-plan" src={c.src} alt="Plan {c.side}: {nameOf(c.plan)}" />{/if}
							<ReportNotes notes={c.plan.annotations} />
						</div>
					{/each}
				</div>
			</section>

			{#if patterns.length}
				<section class="report-section" aria-label="Patterns">
					<h2 class="section-heading">{sameCell ? 'Pattern, both plans' : 'Patterns'}</h2>
					{#if sameCell}
						<PatternCard found={foundB} />
					{:else}
						<div class="columns">
							<div class="column"><p class="column-head"><span class="side">A</span></p><PatternCard found={foundA} /></div>
							<div class="column"><p class="column-head"><span class="side">B</span></p><PatternCard found={foundB} /></div>
						</div>
					{/if}
				</section>
			{/if}

			<section class="report-section">
				<h2 class="section-heading">What changed</h2>
				<table class="metrics-table compare-table">
					<thead>
						<tr><th></th><th>A</th><th>B</th><th>Change</th></tr>
					</thead>
					<tbody>
						{#each rows as r (r.label)}
							<tr class:changed={r.changed}>
								<td class="met-label">{r.label}</td>
								<td class="met-value">{r.a}</td>
								<td class="met-value">{r.b}</td>
								<td class="met-value">{r.change || (r.changed ? 'Changed' : '')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>

			<section class="report-section">
				<h2 class="section-heading">Use Allocation</h2>
				<div class="columns">
					<div class="column"><UseAllocation areas={useFloorAreaByUse(keptPlan(a))} label="A: {nameOf(a)}" /></div>
					<div class="column"><UseAllocation areas={useFloorAreaByUse(keptPlan(b))} label="B: {nameOf(b)}" /></div>
				</div>
			</section>

			{#if steps.length}
				<section class="report-section">
					<h2 class="section-heading">Action Steps for B</h2>
					<ActionSteps {steps} />
				</section>
			{/if}

			{#if creditLine(site.context)}
				<p class="credits-line">{creditLine(site.context)}</p>
			{/if}
		</div>

		<div class="analysis-modal__footer">
			<button class="print-btn" onclick={() => window.print()}>Print / Save as PDF</button>
		</div>
	</div>
</div>

<style>
	.analysis-modal--wide { max-width: 980px; }
	.compare-date { margin: 0; font-size: 0.72rem; color: var(--fh-stone); }
	.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
	.column { min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; }
	.column-head { margin: 0; display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; font-weight: 700; }
	.side {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: 3px;
		background: var(--color-text);
		color: var(--color-surface);
		font-size: 0.65rem;
		font-weight: 700;
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}
	.compare-plan {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: contain;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-surface);
	}
	.compare-table th {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: right;
		padding: 0.2rem 0 0.3rem 0.75rem;
		border-bottom: 1px solid var(--color-border);
	}
	.compare-table :global(td.met-value) { padding-left: 0.75rem; white-space: nowrap; }
	.compare-table :global(td.met-label) { width: auto; }
	.compare-table tr:not(.changed) :global(td.met-value) { font-weight: 400; color: var(--fh-stone); }
</style>
