import { error } from '@sveltejs/kit';
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from './db';
import { committees, invitations, memberships, settings, sites, users } from './db/schema';
import { canManageCommittee, type Role } from './access';
import { invite, type CurrentUser } from './auth';
import { pickSlug } from '../modeler/slug';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A committee's URL slug from its name: one no other committee has ever used. A rename keeps the
// slug when it still fits, otherwise moves it and keeps the old one for redirects.
async function slugFor(name: string, exceptId?: string, current?: string): Promise<string> {
	const others = await db
		.select({ slug: committees.slug, oldSlugs: committees.oldSlugs })
		.from(committees)
		.where(exceptId ? ne(committees.id, exceptId) : undefined);
	const taken = new Set(others.flatMap((c) => [c.slug, ...c.oldSlugs]));
	return pickSlug(name, taken, [], current);
}

function cleanName(raw: string): string {
	const name = raw.trim().slice(0, 120);
	if (!name) error(400, 'Give the committee a name');
	return name;
}

const cleanDescription = (raw: unknown) => (typeof raw === 'string' ? raw.trim().slice(0, 200) : '');

// Committees: who's in them, invitations, and the team's switches

// An invitation whose email can't be sent stays listed (it can be cancelled and sent again)
async function sendInvite(committeeId: string, email: string, role: Role, invitedBy: string, origin: string, note = ''): Promise<boolean> {
	try {
		return await invite(committeeId, email, role, invitedBy, origin, note);
	} catch (e) {
		console.error('Invitation email failed:', e);
		error(502, 'The invitation is saved, but its email couldn’t be sent. Cancel it and try again in a few minutes.');
	}
}

export async function allowNewCommittees(): Promise<boolean> {
	const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'allow_new_committees'));
	return row ? row.value === true : true;
}

export async function setAllowNewCommittees(user: CurrentUser | null, allow: boolean): Promise<void> {
	if (!user?.isTeam) error(403, 'Only the Faith & Home team changes this');
	await db.insert(settings).values({ key: 'allow_new_committees', value: allow }).onConflictDoUpdate({ target: settings.key, set: { value: allow } });
}

// Anyone signed in may start a committee while the team allows it; the team always may
export async function createCommittee(user: CurrentUser | null, rawName: string, description?: unknown): Promise<{ id: string; slug: string }> {
	if (!user) error(401, 'Sign in to start a committee');
	const name = cleanName(rawName);
	if (!user.isTeam && !(await allowNewCommittees())) error(403, 'New committees are by invitation. Ask the Faith & Home team.');
	const [c] = await db
		.insert(committees)
		.values({ name, slug: await slugFor(name), description: cleanDescription(description), createdBy: user.id })
		.returning({ id: committees.id, slug: committees.slug });
	await db.insert(memberships).values({ committeeId: c.id, userId: user.id, role: 'lead' });
	return c;
}

// The team creates a committee for others and invites its first lead
export async function createCommitteeFor(user: CurrentUser | null, rawName: string, leadEmail: string, origin: string, description?: unknown): Promise<string> {
	if (!user?.isTeam) error(403, 'Only the Faith & Home team creates committees for others');
	const name = cleanName(rawName);
	const [c] = await db
		.insert(committees)
		.values({ name, slug: await slugFor(name), description: cleanDescription(description), createdBy: user.id })
		.returning({ id: committees.id });
	if (!(await sendInvite(c.id, leadEmail, 'lead', user.id, origin))) error(400, 'That doesn’t look like an email address');
	return c.id;
}

export interface CommitteeDetail {
	id: string;
	slug: string;
	name: string;
	description: string;
	isTeam: boolean;
	canManage: boolean;
	members: { userId: string; email: string; name: string; role: Role }[];
	invitations: { id: string; email: string; role: Role; expiresAt: Date }[];
	sites: { id: string; slug: string; name: string; visibility: 'public' | 'members'; updatedAt: Date }[];
}

// A committee by its slug, an earlier slug, or its id (as in links made before slugs)
export async function findCommittee(param: string): Promise<{ id: string; slug: string } | null> {
	const key = param.toLowerCase();
	const [c] = await db
		.select({ id: committees.id, slug: committees.slug })
		.from(committees)
		.where(UUID.test(param) ? eq(committees.id, param) : sql`${committees.slug} = ${key} OR ${committees.oldSlugs} @> ${JSON.stringify([key])}::jsonb`);
	return c ?? null;
}

// A committee's page: its members see it; the team sees any
export async function getCommittee(id: string, user: CurrentUser | null): Promise<CommitteeDetail> {
	if (!user) error(401, 'Sign in to see committees');
	const member = user.memberships.some((m) => m.committeeId === id);
	if (!member && !user.isTeam) error(404, 'Committee not found');
	const [c] = await db
		.select({ id: committees.id, slug: committees.slug, name: committees.name, description: committees.description, isTeam: committees.isTeam })
		.from(committees)
		.where(eq(committees.id, id));
	if (!c) error(404, 'Committee not found');
	const canManage = canManageCommittee(id, user);
	const [members, pending, siteRows] = await Promise.all([
		db
			.select({ userId: users.id, email: users.email, name: users.name, role: memberships.role })
			.from(memberships)
			.innerJoin(users, eq(users.id, memberships.userId))
			.where(eq(memberships.committeeId, id))
			.orderBy(asc(users.email)),
		canManage
			? db
					.select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt })
					.from(invitations)
					.where(and(eq(invitations.committeeId, id), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
					.orderBy(desc(invitations.createdAt))
			: Promise.resolve([]),
		db
			.select({ id: sites.id, slug: sites.slug, name: sites.name, visibility: sites.visibility, updatedAt: sites.updatedAt })
			.from(sites)
			.where(eq(sites.committeeId, id))
			.orderBy(desc(sites.updatedAt)),
	]);
	return { ...c, canManage, members, invitations: pending, sites: siteRows };
}

function mustManage(id: string, user: CurrentUser | null) {
	if (!canManageCommittee(id, user)) error(403, 'Only committee leads can do that');
}

// Name and description; a new name may move the slug (the old one keeps redirecting)
export async function updateCommittee(id: string, user: CurrentUser | null, patch: { name?: unknown; description?: unknown }): Promise<{ slug: string }> {
	mustManage(id, user);
	const [c] = await db.select({ slug: committees.slug, oldSlugs: committees.oldSlugs }).from(committees).where(eq(committees.id, id));
	if (!c) error(404, 'Committee not found');
	const set: Partial<typeof committees.$inferInsert> = {};
	if (patch.description !== undefined) set.description = cleanDescription(patch.description);
	if (patch.name !== undefined) {
		if (typeof patch.name !== 'string') error(400, 'name is text');
		set.name = cleanName(patch.name);
		const slug = await slugFor(set.name, id, c.slug);
		if (slug !== c.slug) {
			set.slug = slug;
			set.oldSlugs = [...new Set([...c.oldSlugs, c.slug])].filter((s) => s !== slug);
		}
	}
	if (Object.keys(set).length) await db.update(committees).set(set).where(eq(committees.id, id));
	return { slug: set.slug ?? c.slug };
}

export async function inviteMember(id: string, user: CurrentUser | null, email: string, role: unknown, origin: string, note: unknown = ''): Promise<void> {
	mustManage(id, user);
	if (role !== 'lead' && role !== 'member') error(400, 'role is lead or member');
	if (typeof note !== 'string') error(400, 'note is text');
	if (!(await sendInvite(id, email, role, user!.id, origin, note))) error(400, 'That doesn’t look like an email address');
}

export async function cancelInvitation(id: string, user: CurrentUser | null, invitationId: string): Promise<void> {
	mustManage(id, user);
	await db.delete(invitations).where(and(eq(invitations.id, invitationId), eq(invitations.committeeId, id)));
}

async function leadCount(id: string): Promise<number> {
	const [row] = await db.select({ n: count() }).from(memberships).where(and(eq(memberships.committeeId, id), eq(memberships.role, 'lead')));
	return row.n;
}

async function roleOf(id: string, userId: string): Promise<Role | null> {
	const [row] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.committeeId, id), eq(memberships.userId, userId)));
	return row?.role ?? null;
}

// A committee always keeps a lead: the last one can't step down or leave
export async function setRole(id: string, user: CurrentUser | null, userId: string, role: unknown): Promise<void> {
	mustManage(id, user);
	if (role !== 'lead' && role !== 'member') error(400, 'role is lead or member');
	const current = await roleOf(id, userId);
	if (!current) error(404, 'Not a member');
	if (current === 'lead' && role === 'member' && (await leadCount(id)) <= 1) error(400, 'A committee needs at least one lead');
	await db.update(memberships).set({ role }).where(and(eq(memberships.committeeId, id), eq(memberships.userId, userId)));
}

// Leads remove members; anyone may leave
export async function removeMember(id: string, user: CurrentUser | null, userId: string): Promise<void> {
	if (!user) error(401, 'Sign in first');
	if (userId !== user.id) mustManage(id, user);
	const current = await roleOf(id, userId);
	if (!current) error(404, 'Not a member');
	if (current === 'lead' && (await leadCount(id)) <= 1) error(400, 'A committee needs at least one lead. Make someone else lead first.');
	await db.delete(memberships).where(and(eq(memberships.committeeId, id), eq(memberships.userId, userId)));
}

// The committees page: your committees, with your role; the team sees every committee
export async function listCommittees(user: CurrentUser | null) {
	if (!user) error(401, 'Sign in to see committees');
	const mine = user.memberships.map((m) => m.committeeId);
	const rows = await db
		.select({
			id: committees.id,
			slug: committees.slug,
			name: committees.name,
			description: committees.description,
			isTeam: committees.isTeam,
			createdAt: committees.createdAt,
			// Written out in full: inside a subquery drizzle leaves column names unqualified, so the
			// committee's "id" would resolve to the inner table's
			members: sql<number>`(select count(*)::int from "memberships" m where m."committee_id" = "committees"."id")`,
			sites: sql<number>`(select count(*)::int from "sites" s where s."committee_id" = "committees"."id")`,
		})
		.from(committees)
		.where(user.isTeam ? undefined : mine.length ? inArray(committees.id, mine) : sql`false`)
		.orderBy(desc(committees.isTeam), asc(committees.name));
	return rows.map((c) => ({ ...c, role: user.memberships.find((m) => m.committeeId === c.id)?.role ?? null }));
}
