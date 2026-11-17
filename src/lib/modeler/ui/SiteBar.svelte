<script lang="ts" module>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { store } from '../store.svelte';
	import { planUrl } from '../api';
	import { captureThumbnail } from '../sceneExport';

	// Points the address bar at the plan on screen. Within a site this is shallow (no reload),
	// so unsaved edits survive plan switches; the first save from /modeler navigates for real.
	// Comparing adds `?compare=` with A's slug (empty for existing conditions); B is the plan.
	export async function syncUrl() {
		if (!store.isPersisted) return;
		const a = store.compareA;
		const url = planUrl(store.siteSlug, store.plan.slug, store.readOnly) + (a ? `?compare=${encodeURIComponent(a.slug)}` : '');
		if (location.pathname + location.search === url) return;
		if (page.route.id === '/modeler') await goto(url, { replace: true, reset: false });
		else await goto(url, { shallow: true, replace: true });
	}

	// Opens compare from a loaded URL's `?compare=`; an unknown slug compares with existing conditions
	export function compareFromUrl(params: { get(name: string): string | null }) {
		const slug = params.get('compare');
		if (slug === null) return store.endCompare();
		const a = slug ? store.site.plans.find((p) => p.slug === slug) : undefined;
		store.startCompare((a ?? store.site.existing).id);
	}

	type Member = { committeeId: string; committeeName: string; committeeSlug: string };
	type User = { id: string; isTeam: boolean; memberships: Member[] } | null | undefined;

	// Saving a new site asks which committee it goes to (several, or none yet): shared with the
	// site bar, which shows the choice
	export const saveChoice = $state({ open: false });
	const SKETCH_KEY = 'fh-unsaved-sketch';
	// Set while going to sign in with the sketch kept: the unsaved-changes prompt stays quiet
	export const leaving = { toSignIn: false };

	// Saves the site. A new one needs a signed-in user and a committee: signed out, the sketch is
	// kept in this tab while you sign in, then saved when you're back (/modeler?restore=1).
	export async function saveSite(committeeId?: string): Promise<boolean> {
		if (!store.isPersisted && !committeeId) {
			const user = page.data.user as User;
			if (!user) {
				sessionStorage.setItem(SKETCH_KEY, JSON.stringify($state.snapshot(store.site)));
				leaving.toSignIn = true;
				await goto(`/signin?next=${encodeURIComponent('/modeler?restore=1')}`);
				leaving.toSignIn = false;
				return false;
			}
			if (user.memberships.length !== 1) {
				saveChoice.open = true;
				return false;
			}
			committeeId = user.memberships[0].committeeId;
		}
		saveChoice.open = false;
		const thumbnail = await captureThumbnail(store.plan, store.viewMode === '3d').catch(() => null);
		const isNew = !store.isPersisted;
		const ok = await store.save(thumbnail, committeeId);
		// A new site now has a committee: the breadcrumb names it
		if (ok && isNew && committeeId) {
			const m = (page.data.user as User)?.memberships.find((x) => x.committeeId === committeeId);
			if (m) store.rights.committee = { id: m.committeeId, name: m.committeeName, slug: m.committeeSlug };
		}
		if (ok) await syncUrl();
		return ok;
	}

	// The sketch kept while signing in, if any (and forgets it)
	export function takeUnsavedSketch(): unknown {
		const raw = sessionStorage.getItem(SKETCH_KEY);
		sessionStorage.removeItem(SKETCH_KEY);
		return raw ? JSON.parse(raw) : null;
	}
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let notice = $state('');
	let user = $derived(page.data.user as User);
	let allowNew = $derived(page.data.allowNewCommittees !== false);
	let newCommittee = $state('');
	let choiceError = $state('');
	let shareOpen = $state(false);
	let settingsError = $state('');

	// A new committee for this sketch, with you as its lead, then the save goes there
	async function startCommittee(e: SubmitEvent) {
		e.preventDefault();
		choiceError = '';
		const res = await fetch('/api/committees', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: newCommittee }) });
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			choiceError = body?.message ?? 'Could not start the committee.';
			return;
		}
		await invalidateAll();
		newCommittee = '';
		await saveSite(body.id);
	}

	// Who can open the view link, and which committee owns the site
	async function updateSettings(patch: { visibility?: 'public' | 'members'; committeeId?: string }) {
		settingsError = '';
		const res = await fetch(`/api/sites/${store.site.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
		if (!res.ok) {
			settingsError = (await res.json().catch(() => null))?.message ?? 'Could not change that.';
			return;
		}
		if (patch.visibility) store.rights.visibility = patch.visibility;
		if (patch.committeeId) {
			const m = user?.memberships.find((x) => x.committeeId === patch.committeeId);
			store.rights.committee = { id: patch.committeeId, name: m?.committeeName ?? '', slug: m?.committeeSlug ?? '' };
		}
	}
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let busy = $state(false);

	function flash(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = ''), 2000);
	}

	let status = $derived(
		notice ||
			(store.saveState === 'saving'
				? 'Saving'
				: store.saveState === 'error'
					? store.saveMessage || 'Save failed'
					: store.saveState === 'conflict'
						? 'Someone else saved this site.'
						: store.saveState === 'signin'
							? 'Signed out.'
							: store.isDirty
						? 'Unsaved changes'
						: store.isPersisted
							? 'Saved'
							: ''),
	);

	async function ensureSaved(): Promise<boolean> {
		if (store.isPersisted && !store.isDirty) return true;
		return saveSite();
	}

	async function share() {
		busy = true;
		try {
			if (!(await ensureSaved())) return;
			const link = planUrl(store.siteSlug, store.plan.slug, true);
			await navigator.clipboard.writeText(new URL(link, location.origin).href);
			flash(store.rights.visibility === 'members' ? 'Link copied (committee members only)' : 'Link copied');
		} catch (e) {
			console.error(e);
			flash('Copy failed');
		} finally {
			busy = false;
		}
	}

	// A copy of the current plan in this site, unsaved like any other edit; from the site view, a
	// fresh plan
	function duplicate() {
		store.duplicatePlan();
		syncUrl();
	}
</script>

<div class="site-bar">
	{#if store.readOnly}
		<span class="view-only-tag">View only</span>
		{#if store.rights.canEdit && user}
			<a class="bar-btn" href={planUrl(store.siteSlug, store.plan.slug)}>Open in editor</a>
		{/if}
	{:else}
		<span class="save-status" class:save-status--error={store.saveState === 'error' || store.saveState === 'conflict'} aria-live="polite">{status}</span>
		{#if store.saveState === 'conflict'}
			<button class="bar-btn" onclick={() => location.reload()} title="Load their changes; yours in this tab are lost">Reload</button>
		{:else if store.saveState === 'signin'}
			<a class="bar-btn" href="/signin?next={encodeURIComponent(location.pathname)}">Sign in</a>
		{/if}
		<button
			class="bar-btn bar-btn--primary"
			onclick={() => saveSite()}
			disabled={store.saveState === 'saving' || (store.isPersisted && !store.isDirty)}
			title="Save (Cmd+S)"
		>Save</button>
		<div class="share">
			<button class="bar-btn" onclick={() => (store.isPersisted ? (shareOpen = !shareOpen) : share())} disabled={busy} aria-expanded={shareOpen} title="Copy a view-only link">Share</button>
			{#if shareOpen}
				<div class="share-menu">
					<button class="share-copy" onclick={() => { shareOpen = false; share(); }}>Copy view link</button>
					<fieldset class="share-field">
						<legend>Who can open the view link</legend>
						<label><input type="radio" name="visibility" checked={store.rights.visibility === 'public'} onchange={() => updateSettings({ visibility: 'public' })} /> Anyone with the link</label>
						<label><input type="radio" name="visibility" checked={store.rights.visibility === 'members'} onchange={() => updateSettings({ visibility: 'members' })} /> Committee members only</label>
					</fieldset>
					{#if store.rights.canDelete && user && user.memberships.length > 1}
						<label class="share-field">
							<span>Committee</span>
							<select value={store.rights.committee?.id ?? ''} onchange={(e) => updateSettings({ committeeId: (e.target as HTMLSelectElement).value })}>
								{#each user.memberships as m (m.committeeId)}<option value={m.committeeId}>{m.committeeName}</option>{/each}
							</select>
						</label>
					{:else if store.rights.committee}
						<p class="share-note">Belongs to {store.rights.committee.name}</p>
					{/if}
					{#if settingsError}<p class="share-error">{settingsError}</p>{/if}
				</div>
			{/if}
		</div>
		{#if store.onSite}
			<button class="bar-btn" onclick={duplicate} title="Start a plan from existing conditions">New plan</button>
		{:else}
			<button class="bar-btn" onclick={duplicate} title="Copy this plan as a new scenario">Duplicate</button>
		{/if}
	{/if}
	<a class="bar-btn" href="/modeler/sites">Sites</a>
</div>

<!-- Saving a new site: which committee it goes to -->
{#if saveChoice.open}
	<div class="choice-backdrop" role="presentation" onclick={() => (saveChoice.open = false)}></div>
	<div class="choice" role="dialog" aria-label="Save to a committee">
		<h2 class="choice-title">Save to a committee</h2>
		<p class="choice-text">Your committee's members can open and work on the site with you.</p>
		{#if user?.memberships.length}
			<ul class="choice-list">
				{#each user.memberships as m (m.committeeId)}
					<li><button class="bar-btn" onclick={() => saveSite(m.committeeId)}>{m.committeeName}</button></li>
				{/each}
			</ul>
		{/if}
		{#if allowNew}
			<form class="choice-new" onsubmit={startCommittee}>
				<label for="new-committee">{user?.memberships.length ? 'Or start a committee' : 'Start a committee'}</label>
				<input id="new-committee" class="choice-input" placeholder="e.g. Grace Church building committee" bind:value={newCommittee} required />
				<button class="bar-btn bar-btn--primary" type="submit">Start and save</button>
			</form>
		{:else if !user?.memberships.length}
			<p class="choice-text">New committees are by invitation. Ask the Faith & Home team to invite you.</p>
		{/if}
		{#if choiceError}<p class="share-error">{choiceError}</p>{/if}
		<button class="choice-cancel" onclick={() => (saveChoice.open = false)}>Cancel</button>
	</div>
{/if}

<style>
	.site-bar {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.share { position: relative; }
	.share-menu {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.35rem);
		z-index: 20;
		width: 15rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.6rem;
		background: var(--fh-linen);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0 0 0 / 0.1);
		font-size: 0.72rem;
	}
	.share-copy {
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: #fff;
		font: inherit;
		cursor: pointer;
	}
	.share-field { display: flex; flex-direction: column; gap: 0.2rem; border: none; margin: 0; padding: 0; }
	.share-field legend, .share-field span { font-weight: 600; margin-bottom: 0.15rem; }
	.share-note { margin: 0; color: var(--fh-stone); }
	.share-error { margin: 0; color: var(--fh-terracotta); font-size: 0.72rem; }

	.choice-backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0 0 0 / 0.25); }
	.choice {
		position: fixed;
		z-index: 41;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(24rem, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1rem 1.1rem;
		background: var(--fh-linen);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		box-shadow: 0 8px 32px rgba(0 0 0 / 0.2);
	}
	.choice-title { margin: 0; font-size: 1rem; }
	.choice-text { margin: 0; font-size: 0.78rem; color: var(--color-text); }
	.choice-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	.choice-list .bar-btn { width: 100%; text-align: left; padding: 0.4rem 0.6rem; font-size: 0.8rem; }
	.choice-new { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.75rem; }
	.choice-input { padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.8rem; background: #fff; }
	.choice-cancel { align-self: flex-end; border: none; background: none; font: inherit; font-size: 0.75rem; text-decoration: underline; cursor: pointer; color: var(--color-text); }

	.save-status {
		font-size: 0.68rem;
		color: var(--fh-stone);
		min-width: 6.5em;
		text-align: right;
	}

	.save-status--error { color: var(--fh-terracotta); }

	.view-only-tag {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		background: var(--fh-dusk-tint);
		color: var(--color-text);
	}

	.bar-btn {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: none;
		font-size: 0.7rem;
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
		text-decoration: none;
		line-height: normal;
	}

	.bar-btn:hover:not(:disabled) { background: #ece8e0; }
	.bar-btn:disabled { opacity: 0.4; cursor: default; }

	.bar-btn--primary {
		background: var(--fh-dusk);
		border-color: var(--fh-dusk);
		color: #fff;
	}

	.bar-btn--primary:hover:not(:disabled) { background: #5a70a6; }
</style>
