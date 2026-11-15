<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Masthead from '#lib/modeler/ui/Masthead.svelte';
	import { siteUrl } from '#lib/modeler/api';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let c = $derived(data.committee);
	let me = $derived(data.user!);

	let email = $state('');
	let role = $state<'member' | 'lead'>('member');
	let message = $state('');
	let error = $state('');
	let editing = $state(false);
	let newName = $state('');
	let newDescription = $state('');

	// Calls the committee API, then reloads the page's data
	async function call(url: string, method: string, body?: unknown, done = '') {
		error = '';
		message = '';
		const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
		if (!res.ok) {
			error = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'That didn’t work. Try again.';
			return false;
		}
		message = done;
		await invalidateAll();
		return true;
	}

	async function sendInvite(e: SubmitEvent) {
		e.preventDefault();
		if (await call(`/api/committees/${c.id}/invitations`, 'POST', { email, role }, `Invitation sent to ${email}.`)) email = '';
	}

	async function leave() {
		if (await call(`/api/committees/${c.id}/members/${me.id}`, 'DELETE')) await goto('/modeler/sites');
	}

	// Name and description; a new name can move the page's address (the old one redirects)
	async function saveDetails(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const res = await fetch(`/api/committees/${c.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName, description: newDescription }),
		});
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			error = body?.message ?? 'That didn’t work. Try again.';
			return;
		}
		editing = false;
		if (body.slug !== c.slug) await goto(`/committees/${body.slug}`, { replaceState: true, invalidateAll: true });
		else await invalidateAll();
	}

	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head>
	<title>{c.name}</title>
</svelte:head>

<div class="committee-page">
	<Masthead />
	<main class="committee-main">
		<a class="back" href="/modeler/sites">Sites</a>
		{#if editing}
			<form class="details" onsubmit={saveDetails}>
				<label class="field-label" for="committee-name">Name</label>
				<input id="committee-name" class="text-input" bind:value={newName} required />
				<label class="field-label" for="committee-description">Description</label>
				<input id="committee-description" class="text-input" placeholder="e.g. Grace UMC, Allentown: property committee" maxlength="200" bind:value={newDescription} />
				<div class="details-actions">
					<button class="btn btn--primary" type="submit">Save</button>
					<button class="btn" type="button" onclick={() => (editing = false)}>Cancel</button>
				</div>
			</form>
		{:else}
			<h2 class="title">
				{c.name}
				{#if c.canManage}<button class="link-btn" onclick={() => { newName = c.name; newDescription = c.description; editing = true; }}>Edit</button>{/if}
			</h2>
			{#if c.description}<p class="description">{c.description}</p>{/if}
		{/if}
		{#if c.isTeam}<p class="note">The Faith & Home team: members can see and help with every committee's sites.</p>{/if}

		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if message}<p class="message" role="status">{message}</p>{/if}

		<section class="section" aria-label="Sites">
			<h3 class="heading">Sites</h3>
			{#if c.sites.length}
				<ul class="list">
					{#each c.sites as s (s.id)}
						<li class="row">
							<a href={siteUrl(s.slug)}>{s.name || 'Untitled'}</a>
							<span class="meta">{s.visibility === 'members' ? 'Members only' : 'View link open'} · Updated {dateFmt.format(new Date(s.updatedAt))}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta">No sites yet. <a href="/modeler">Start one</a> and save it to this committee.</p>
			{/if}
		</section>

		<section class="section" aria-label="Members">
			<h3 class="heading">Members</h3>
			<ul class="list">
				{#each c.members as m (m.userId)}
					<li class="row">
						<span>{m.name || m.email}{#if m.name}<span class="meta member-email">{m.email}</span>{/if}</span>
						<span class="role">{m.role === 'lead' ? 'Lead' : 'Member'}</span>
						{#if c.canManage && m.userId !== me.id}
							<button class="link-btn" onclick={() => call(`/api/committees/${c.id}/members/${m.userId}`, 'PATCH', { role: m.role === 'lead' ? 'member' : 'lead' })}>
								{m.role === 'lead' ? 'Make member' : 'Make lead'}
							</button>
							<button class="link-btn link-btn--danger" onclick={() => call(`/api/committees/${c.id}/members/${m.userId}`, 'DELETE')}>Remove</button>
						{/if}
						{#if m.userId === me.id}
							<button class="link-btn" onclick={leave}>Leave</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		{#if c.canManage}
			<section class="section" aria-label="Invite">
				<h3 class="heading">Invite</h3>
				<form class="invite" onsubmit={sendInvite}>
					<input class="text-input" type="email" aria-label="Email" placeholder="name@example.org" bind:value={email} required />
					<select class="text-input" aria-label="Role" bind:value={role}>
						<option value="member">Member</option>
						<option value="lead">Lead</option>
					</select>
					<button class="btn btn--primary" type="submit">Send invitation</button>
				</form>
				<p class="meta">Members edit the committee's sites and plans. Leads also invite people and delete sites.</p>
				{#if c.invitations.length}
					<ul class="list">
						{#each c.invitations as i (i.id)}
							<li class="row">
								<span>{i.email}</span>
								<span class="role">{i.role === 'lead' ? 'Lead' : 'Member'}, invited</span>
								<span class="meta">until {dateFmt.format(new Date(i.expiresAt))}</span>
								<button class="link-btn" onclick={() => call(`/api/committees/${c.id}/invitations/${i.id}`, 'DELETE')}>Cancel</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</main>
</div>

<style>
	/* Scrolls itself: the modeler sets overflow: hidden on html and body */
	.committee-page { height: 100%; overflow-y: auto; background: var(--color-surface); }
	.committee-main { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
	.back { font-size: 0.75rem; color: var(--color-text); }
	.title { font-family: var(--font-display); font-weight: normal; font-size: 1.8rem; margin: 0.5rem 0; display: flex; align-items: baseline; gap: 0.75rem; }
	.note, .meta { font-size: 0.75rem; color: var(--fh-stone); }
	.section { margin-top: 1.5rem; }
	.heading { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.4rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--color-border); }
	.list { list-style: none; margin: 0; padding: 0; }
	.row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6rem; padding: 0.35rem 0; font-size: 0.85rem; border-bottom: 1px solid #ebe8e1; }
	.row a { color: var(--color-text); }
	.member-email { margin-left: 0.45rem; }
	.role { font-size: 0.72rem; color: var(--fh-stone); margin-left: auto; }
	.invite { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.4rem; }
	.details { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.5rem 0; max-width: 28rem; }
	.details-actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
	.field-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
	.description { margin: -0.2rem 0 0.4rem; font-size: 0.9rem; }
	.text-input { padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.85rem; background: #fff; }
	.btn { padding: 0.35rem 0.75rem; border: 1px solid var(--color-border); border-radius: 3px; background: none; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.btn--primary { background: var(--fh-dusk); border-color: var(--fh-dusk); color: #fff; }
	.link-btn { border: none; background: none; padding: 0; font: inherit; font-size: 0.75rem; color: var(--color-selection); text-decoration: underline; cursor: pointer; }
	.link-btn--danger { color: var(--fh-terracotta); }
	.error { font-size: 0.8rem; color: var(--fh-terracotta); }
	.message { font-size: 0.8rem; }
</style>
