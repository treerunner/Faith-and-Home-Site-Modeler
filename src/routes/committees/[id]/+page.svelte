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
	let renaming = $state(false);
	let newName = $state('');

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

	async function rename(e: SubmitEvent) {
		e.preventDefault();
		if (await call(`/api/committees/${c.id}`, 'PATCH', { name: newName })) renaming = false;
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
		{#if renaming}
			<form class="rename" onsubmit={rename}>
				<input class="text-input" aria-label="Committee name" bind:value={newName} required />
				<button class="btn btn--primary" type="submit">Save</button>
				<button class="btn" type="button" onclick={() => (renaming = false)}>Cancel</button>
			</form>
		{:else}
			<h2 class="title">
				{c.name}
				{#if c.canManage}<button class="link-btn" onclick={() => { newName = c.name; renaming = true; }}>Rename</button>{/if}
			</h2>
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
	.invite, .rename { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.4rem; }
	.text-input { padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: 3px; font: inherit; font-size: 0.85rem; background: #fff; }
	.btn { padding: 0.35rem 0.75rem; border: 1px solid var(--color-border); border-radius: 3px; background: none; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.btn--primary { background: var(--fh-dusk); border-color: var(--fh-dusk); color: #fff; }
	.link-btn { border: none; background: none; padding: 0; font: inherit; font-size: 0.75rem; color: var(--color-selection); text-decoration: underline; cursor: pointer; }
	.link-btn--danger { color: var(--fh-terracotta); }
	.error { font-size: 0.8rem; color: var(--fh-terracotta); }
	.message { font-size: 0.8rem; }
</style>
