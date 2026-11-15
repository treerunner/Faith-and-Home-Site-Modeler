import { expect, test, type Page } from '@playwright/test';
import { hashToken, newToken } from '../../lib/server/tokens';
import { makeCommittee, makeUser, removeCommittees, removeUsers, signIn, sql } from '../../../tests/e2e/auth';

// Accounts and committees: each test makes its own users and committees in the .env database
// and removes them (a committee takes its sites with it).

const users: string[] = [];
const committees: string[] = [];
test.afterAll(async () => {
	await removeCommittees(...committees);
	await removeUsers(...users);
});

async function committee(label: string) {
	const id = await makeCommittee(`E2E ${label} ${Date.now()}`);
	committees.push(id);
	return id;
}

async function user(label: string, memberships: { committeeId: string; role: 'lead' | 'member' }[] = []) {
	const u = await makeUser(label, memberships);
	users.push(u.id);
	return u;
}

// A saved site in a committee, made through the API as a member of it
async function siteIn(page: Page, committeeId: string, name: string, visibility: 'public' | 'members' = 'public') {
	const id = crypto.randomUUID();
	const res = await page.request.put(`/api/sites/${id}`, { headers: { origin: 'http://localhost:4173' }, data: { id, name, committeeId } });
	expect(res.ok()).toBe(true);
	if (visibility === 'members') await sql`UPDATE sites SET visibility = 'members' WHERE id = ${id}`;
	return (await res.json()) as { id: string; slug: string };
}

const canvas = (page: Page) => page.locator('.canvas-area canvas');

test('sign in by email link', async ({ page, browser }) => {
	const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const p = await anon.newPage();
	await p.goto('/signin');
	const email = `e2e-link-${Date.now()}@example.test`;
	await p.getByLabel('Email').fill(email);
	await p.getByRole('button', { name: 'Send sign-in link' }).click();
	await expect(p.getByText(`We sent a sign-in link to ${email}`)).toBeVisible();
	const [row] = await sql`SELECT count(*)::int AS n FROM login_tokens WHERE email = ${email}`;
	expect(row.n).toBe(1);

	// The link itself (the email isn't sent in tests): a token we know, as the server stores it
	const token = newToken();
	await sql`INSERT INTO login_tokens (token_hash, email, next, expires_at) VALUES (${await hashToken(token)}, ${email}, '/modeler/sites', now() + interval '15 minutes')`;
	await p.goto(`/auth/verify?token=${token}`);
	await expect(p).toHaveURL(/\/modeler\/sites$/);
	await expect(p.getByRole('button', { name: new RegExp(email) })).toBeVisible();
	const [u] = await sql`SELECT id FROM users WHERE email = ${email}`;
	users.push(u.id);
	// A link works once
	await p.goto(`/auth/verify?token=${token}`);
	await expect(p).toHaveURL(/\/signin\?expired=1$/);
	await anon.close();
});

test('a sketch made signed out is kept through sign-in and saved to the committee', async ({ browser }) => {
	const c = await committee('sketch');
	const lead = await user('sketch', [{ committeeId: c, role: 'lead' }]);
	const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await anon.newPage();
	await page.goto('/modeler');
	await page.getByLabel('Site name').fill(`E2E sketch ${Date.now()}`);
	await page.getByLabel('Drag to place Square').dragTo(canvas(page));
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(/\/signin\?next=/);
	// Signing in (the email link is skipped: the session is made directly) brings the sketch back
	await signIn(anon, lead);
	await page.goto('/modeler?restore=1');
	await expect(page).toHaveURL(/\/modeler\/e2e-sketch-\d+$/, { timeout: 20000 });
	await expect(page.locator('.struct-item')).toHaveCount(1);
	const [row] = await sql`SELECT committee_id FROM sites WHERE slug = ${page.url().split('/').pop()!}`;
	expect(row.committee_id).toBe(c);
	await anon.close();
});

test('members edit, leads invite and delete, outsiders see only public view links', async ({ browser }) => {
	const c = await committee('access');
	const lead = await user('lead', [{ committeeId: c, role: 'lead' }]);
	const member = await user('member', [{ committeeId: c, role: 'member' }]);
	const outsider = await user('outsider');

	const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await ctx.newPage();
	await signIn(ctx, lead);
	const open = await siteIn(page, c, `E2E open ${Date.now()}`);
	const closed = await siteIn(page, c, `E2E closed ${Date.now()}`, 'members');

	// The lead invites someone; the invitation is listed
	await page.goto(`/committees/${c}`);
	await page.getByLabel('Email').fill(`e2e-invitee-${Date.now()}@example.test`);
	await page.getByRole('button', { name: 'Send invitation' }).click();
	await expect(page.getByText(/Invitation sent to/)).toBeVisible();
	await expect(page.getByRole('region', { name: 'Invite' }).getByText(', invited')).toHaveCount(1);
	await page.screenshot({ path: 'tests/screenshots/auth-committee.png', fullPage: true });

	// A member edits but can't invite or delete
	await signIn(ctx, member);
	await page.goto(`/modeler/${open.slug}`);
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
	await page.goto(`/committees/${c}`);
	await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0);
	expect((await page.request.delete(`/api/sites/${open.id}`, { headers: { origin: 'http://localhost:4173' } })).status()).toBe(403);
	await page.goto('/modeler/sites');
	await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

	// An outsider: the public view link works, the editor sends them to it, the private site isn't there
	await signIn(ctx, outsider);
	await page.goto(`/modeler/${open.slug}`);
	await expect(page).toHaveURL(new RegExp(`/modeler/${open.slug}/view$`));
	await expect(page.getByText('View only')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open in editor' })).toHaveCount(0);
	await page.goto(`/modeler/${closed.slug}/view`);
	await expect(page.getByText('Site not found')).toBeVisible();
	expect((await page.request.put(`/api/sites/${open.id}`, { headers: { origin: 'http://localhost:4173' }, data: { id: open.id, name: 'Taken' } })).status()).toBe(404);

	// Signed out: a private site asks you to sign in
	await ctx.clearCookies();
	await page.goto(`/modeler/${closed.slug}/view`);
	await expect(page).toHaveURL(/\/signin\?next=/);

	// An invitation link joins the committee
	await signIn(ctx, outsider);
	const token = newToken();
	await sql`INSERT INTO invitations (committee_id, email, role, token_hash, expires_at) VALUES (${c}, ${outsider.email}, 'member', ${await hashToken(token)}, now() + interval '1 day')`;
	await page.goto(`/auth/invite?token=${token}`);
	await expect(page).toHaveURL(/\/committees\/e2e-[\w-]+$/); // the committee's slug
	await page.goto(`/modeler/${closed.slug}`);
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

	// The lead deletes
	await signIn(ctx, lead);
	expect((await page.request.delete(`/api/sites/${closed.id}`, { headers: { origin: 'http://localhost:4173' } })).status()).toBe(204);
	await ctx.close();
});

test('a save made from an older version is refused, not overwritten', async ({ browser }) => {
	const c = await committee('conflict');
	const lead = await user('conflict', [{ committeeId: c, role: 'lead' }]);
	const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	await signIn(ctx, lead);
	const a = await ctx.newPage();
	const site = await siteIn(a, c, `E2E conflict ${Date.now()}`);
	const b = await ctx.newPage();
	await a.goto(`/modeler/${site.slug}`);
	await b.goto(`/modeler/${site.slug}`);
	await a.getByLabel('Drag to place Square').dragTo(canvas(a));
	await a.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(a.getByText('Saved', { exact: true })).toBeVisible();
	await b.getByLabel('Drag to place Circle').dragTo(canvas(b));
	await b.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(b.getByText('Someone else saved this site.')).toBeVisible();
	await expect(b.getByRole('button', { name: 'Reload' })).toBeVisible();
	await ctx.close();
});

test('the team steps into any committee and alone sets pattern examples', async ({ page, browser }) => {
	const c = await committee('help');
	const lead = await user('help', [{ committeeId: c, role: 'lead' }]);
	const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const theirs = await ctx.newPage();
	await signIn(ctx, lead);
	const site = await siteIn(theirs, c, `E2E help ${Date.now()}`, 'members');

	// The team (this test's own page) edits it and sees the committee
	await page.goto(`/modeler/${site.slug}`);
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
	await page.goto(`/committees/${c}`);
	await expect(page.getByRole('button', { name: 'Send invitation' })).toBeVisible();
	await page.goto('/admin');
	await expect(page.getByRole('link', { name: /E2E help/ })).toBeVisible();
	// Committees have readable addresses; renaming moves it and the old one redirects
	await page.getByRole('link', { name: /E2E help/ }).click();
	await expect(page).toHaveURL(/\/committees\/e2e-[\w-]+$/);
	const oldUrl = page.url();
	await page.getByRole('button', { name: 'Edit' }).click();
	const renamed = `E2E Grace building ${Date.now()}`;
	await page.getByLabel('Name').fill(renamed);
	await page.getByLabel('Description').fill('Grace UMC, Allentown: property committee');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(/\/committees\/e2e-grace-building-\d+$/);
	await expect(page.getByText('Grace UMC, Allentown: property committee')).toBeVisible();
	await page.goto(oldUrl);
	await expect(page).toHaveURL(/\/committees\/e2e-grace-building-\d+$/);
	await page.goto('/admin');
	await page.screenshot({ path: 'tests/screenshots/auth-admin.png' });
	await page.goto('/modeler/sites');
	await page.getByRole('button', { name: /^E2E team/ }).click(); // the account menu
	await page.screenshot({ path: 'tests/screenshots/auth-sites.png' });

	// A committee lead can't peg examples
	const res = await theirs.request.put('/api/patterns/urban-box-adaptive-reuse/example', { headers: { origin: 'http://localhost:4173' }, data: { siteId: site.id, planId: null } });
	expect(res.status()).toBe(403);
	await ctx.close();
});
