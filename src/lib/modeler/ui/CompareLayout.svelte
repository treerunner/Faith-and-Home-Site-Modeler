<script lang="ts">
	import { page } from '$app/state';
	import Scene from '../scene/Scene.svelte';
	import SceneRoot from '../scene/SceneRoot.svelte';
	import OpenSpaceLabels from './OpenSpaceLabels.svelte';
	import AnnotationDots from './AnnotationDots.svelte';
	import Attribution from './Attribution.svelte';
	import CompareAnalysis from './CompareAnalysis.svelte';
	import { clientToSite, sceneView, type OrbitSync, type SceneView } from '../scene/cameraRef';
	import { store } from '../store.svelte';
	import { syncUrl } from './SiteBar.svelte';
	import { panBy, type PlanView } from '../view';
	import { compareRows, planSummary } from '../compare';
	import type { Plan } from '../types';

	// Two plans side by side, read-only: A (what B is compared against) and B (the plan you were
	// on). Plan view is shared, so both pan and zoom together; in 3D they orbit together.
	let a = $derived(store.compareA!);
	let b = $derived(store.plan);

	const views = { a: sceneView(), b: sceneView() };
	const orbit = $state<OrbitSync>({ position: [60, 80, 80], target: [0, 0, 0], source: null, version: 0 });

	let rows = $derived(compareRows(planSummary(a, store.site), planSummary(b, store.site)));
	let short = $derived(rows.filter((r) => r.short));

	let choices = $derived([store.site.existing, ...store.site.plans]);
	const nameOf = (p: Plan) => (p.id === store.site.existing.id ? p.name : p.name || 'Untitled plan');

	function pick(side: 'a' | 'b', id: string) {
		store.setCompare(side, id);
		syncUrl();
	}

	function swap() {
		store.swapCompare();
		syncUrl();
	}

	function exit() {
		store.endCompare();
		syncUrl();
	}

	let showAnalysis = $state(false);

	type User = { isTeam: boolean; memberships: { committeeId: string }[] } | null | undefined;
	let user = $derived(page.data.user as User);
	let committee = $derived(store.rights.committee);
	let committeeLink = $derived(!!committee && !!user && (user.isTeam || user.memberships.some((m) => m.committeeId === committee!.id)));

	// Plan view: the wheel zooms toward the cursor and a drag pans, in either view, moving both
	function wheel(e: WheelEvent, view: SceneView) {
		if (store.viewMode !== 'plan') return;
		e.preventDefault();
		const pos = clientToSite(e.clientX, e.clientY, view);
		store.zoomPlan(e.deltaY > 0 ? 1.1 : 1 / 1.1, pos ? [pos.x, pos.y] : undefined);
	}

	let press: { x: number; y: number; view: PlanView; el: HTMLCanvasElement } | null = null;
	function down(e: PointerEvent, view: SceneView) {
		if (store.viewMode !== 'plan' || e.buttons === 0 || !view.el) return;
		press = { x: e.clientX, y: e.clientY, view: store.planView, el: view.el };
		view.el.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!press) return;
		const { clientWidth: w, clientHeight: h } = press.el;
		store.planView = panBy(press.view, e.clientX - press.x, e.clientY - press.y, h || 1, store.boardHalf, (w || 1) / (h || 1));
	}
	function up() {
		press = null;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (showAnalysis) showAnalysis = false;
		else exit();
	}
</script>

<svelte:window {onkeydown} />

<div class="compare">
	<nav class="compare-header" aria-label="Where you are">
		<span class="crumb crumb--committee">
			{#if !store.isPersisted}
				Unsaved sketch
			{:else if committee && committeeLink}
				<a href="/committees/{committee.slug}">{committee.name}</a>
			{:else if committee}
				{committee.name}
			{/if}
		</span>
		<span class="sep" aria-hidden="true">›</span>
		<span class="crumb crumb--site">{store.site.name || 'Untitled site'}</span>
		<span class="sep" aria-hidden="true">›</span>
		<span class="crumb crumb--site">Compare</span>

		<div class="pickers">
			<label class="picker">
				<span class="side">A</span>
				<select aria-label="Plan A" value={a.id} onchange={(e) => pick('a', (e.target as HTMLSelectElement).value)}>
					{#each choices as p (p.id)}<option value={p.id}>{nameOf(p)}</option>{/each}
				</select>
			</label>
			<button class="swap" onclick={swap} aria-label="Swap A and B" title="Swap A and B">⇄</button>
			<label class="picker">
				<span class="side">B</span>
				<select aria-label="Plan B" value={b.id} onchange={(e) => pick('b', (e.target as HTMLSelectElement).value)}>
					{#each choices as p (p.id)}<option value={p.id}>{nameOf(p)}</option>{/each}
				</select>
			</label>
		</div>
		<button class="exit" onclick={exit} title="Back to {nameOf(b)} (Esc)">Exit compare</button>
	</nav>

	<div class="views">
		{#each [{ side: 'A', plan: a, view: views.a }, { side: 'B', plan: b, view: views.b }] as v (v.side)}
			<section class="view" aria-label="{v.side}: {nameOf(v.plan)}">
				<div class="view-label"><span class="side">{v.side}</span> {nameOf(v.plan)}</div>
				<Scene
					view={v.view}
					label="Plan {v.side}: {nameOf(v.plan)}"
					onwheel={(e) => wheel(e, v.view)}
					onpointerdown={(e) => down(e, v.view)}
					onpointermove={move}
					onpointerup={up}
				>
					<SceneRoot plan={v.plan} interactive={false} {orbit} />
				</Scene>
				<OpenSpaceLabels plan={v.plan} view={v.view} interactive={false} />
				<AnnotationDots plan={v.plan} view={v.view} always />
				{#if v.side === 'B'}<Attribution />{/if}
			</section>
		{/each}
	</div>

	<!-- What changed from A to B, in short; the compare analysis has it all -->
	<dl class="strip" aria-label="What changed">
		{#each short as r (r.label)}
			<div class="metric" class:metric--changed={r.changed}>
				<dt>{r.label}</dt>
				<dd>
					{#if r.changed}
						<span class="from">{r.a}</span> → <strong>{r.b}</strong>
						{#if r.change}<span class="change">{r.change}</span>{/if}
					{:else}
						{r.b}
					{/if}
				</dd>
			</div>
		{/each}
	</dl>

	<div class="toolbar">
		<div class="view-tabs" role="group" aria-label="View mode">
			<button class="view-tab" class:view-tab--active={store.viewMode === 'plan'} onclick={() => (store.viewMode = 'plan')}>Plan</button>
			<button class="view-tab" class:view-tab--active={store.viewMode === '3d'} onclick={() => (store.viewMode = '3d')}>3D</button>
		</div>
		{#if store.viewMode === 'plan'}
			<button class="tool-btn" onclick={() => store.fitPlan()} title="Fit the site in view. Drag to pan.">Fit</button>
		{/if}
		<button class="tool-btn" class:tool-btn--off={!store.showLabels} onclick={() => (store.showLabels = !store.showLabels)} title="Toggle open space labels">Labels</button>
		<span class="spacer"></span>
		<button class="tool-btn" onclick={() => (showAnalysis = true)}>Compare analysis</button>
	</div>

	{#if showAnalysis}
		<CompareAnalysis {a} {b} viewA={views.a} viewB={views.b} onclose={() => (showAnalysis = false)} />
	{/if}
</div>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		position: relative;
	}

	.compare-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
		padding: 0.3rem 1.25rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.85rem;
	}
	.crumb { white-space: nowrap; }
	.crumb--committee { color: var(--fh-stone); }
	.crumb--committee a { color: inherit; text-decoration: none; }
	.crumb--committee a:hover { color: var(--color-text); text-decoration: underline; }
	.crumb--site { font-weight: 600; }
	.sep { color: var(--fh-stone); }

	.pickers { display: flex; align-items: center; gap: 0.35rem; margin-left: 1rem; }
	.picker { display: flex; align-items: center; gap: 0.3rem; }
	.picker select {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.1rem 0.3rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: #fff;
		max-width: 14rem;
	}
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
	}
	.swap, .exit, .tool-btn {
		padding: 0.15rem 0.55rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font: inherit;
		font-size: 0.75rem;
		color: var(--color-text);
		cursor: pointer;
	}
	.swap:hover, .exit:hover, .tool-btn:hover { background: #ece8e0; }
	.exit { margin-left: auto; }
	.tool-btn { font-size: 0.7rem; padding: 0.2rem 0.6rem; }
	.tool-btn--off { opacity: 0.45; }

	.views {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: var(--color-border);
	}
	.view {
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: var(--color-base);
	}
	.view-label {
		position: absolute;
		top: 0.5rem;
		left: 0.6rem;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.15rem 0.5rem 0.15rem 0.2rem;
		border-radius: 4px;
		background: rgba(247 247 242 / 0.9);
		font-size: 0.8rem;
		font-weight: 600;
		pointer-events: none;
	}
	@media (max-width: 800px) {
		.views { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
	}

	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.5rem;
		margin: 0;
		padding: 0.45rem 1.25rem;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		font-size: 0.75rem;
	}
	.metric { display: flex; flex-direction: column; }
	.metric dt {
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fh-stone);
	}
	.metric dd { margin: 0; font-variant-numeric: tabular-nums; }
	.metric--changed dt { color: var(--color-text); }
	.from { color: var(--fh-stone); }
	.change { margin-left: 0.3rem; font-size: 0.68rem; color: var(--fh-stone); }

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		background: rgba(247 247 242 / 0.95);
		border-top: 1px solid var(--color-border);
	}
	.spacer { flex: 1; }
	.view-tabs { display: flex; gap: 2px; background: var(--color-border); border-radius: 4px; padding: 2px; }
	.view-tab {
		padding: 0.2rem 0.6rem;
		border: none;
		border-radius: 3px;
		background: transparent;
		font-size: 0.7rem;
		color: var(--color-text);
		cursor: pointer;
		font-weight: 500;
	}
	.view-tab:hover { background: rgba(255 255 255 / 0.6); }
	.view-tab--active { background: #fff; font-weight: 600; box-shadow: 0 1px 2px rgba(0 0 0 / 0.1); }
</style>
