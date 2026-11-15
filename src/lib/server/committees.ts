import { error } from '@sveltejs/kit';
import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { committees, invitations, memberships, settings, sites, users } from './db/schema';
import { canManageCommittee, type Role } from './access';
import { invite, type CurrentUser } from './auth';

// Committees: who's in them, invitations, and the team's switches

export async function allowNewCommittees(): Promise<boolean> {
	const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'allow_new_committees'));
	return row ? row.value === true : true;
}

export async function setAllowNewCommittees(user: CurrentUser | null, allow: boolean): Promise<void> {
	if (!user?.isTeam) error(403, 'Only the Faith & Home team changes this');
	await db.insert(settings).values({ key: 'allow_new_committees', value: allow }).onConflictDoUpdate({ target: settings.key, set: { value: allow } });
}

// Anyone signed in may start a committee while the team allows it; the team always may
export async function createCommittee(user: CurrentUser | null, rawName: string): Promise<string> {
	if (!user) error(401, 'Sign in to start a committee');
	const name = rawName.trim().slice(0, 120);
	if (!name) error(400, 'Give the committee a name');
	if (!user.isTeam && !(await allowNewCommittees())) error(403, 'New committees are by invitation. Ask the Faith & Home team.');
	const [c] = await db.insert(committees).values({ name, createdBy: user.id }).returning({ id: committees.id });
	await db.insert(memberships).values({ committeeId: c.id, userId: user.id, role: 'lead' });
	return c.id;
}

// The team creates a committee for others and invites its first lead
export async function createCommitteeFor(user: CurrentUser | null, rawName: string, leadEmail: string, origin: string): Promise<string> {
	if (!user?.isTeam) error(403, 'Only the Faith & Home team creates committees for others');
	const name = rawName.trim().slice(0, 120);
	if (!name) error(400, 'Give the committee a name');
	const [c] = await db.insert(committees).values({ name, createdBy: user.id }).returning({ id: committees.id });
	if (!(await invite(c.id, leadEmail, 'lead', user.id, origin))) error(400, 'That doesn’t look like an email address');
	return c.id;
}

export interface CommitteeDetail {
	id: string;
	name: string;
	isTeam: boolean;
	canManage: boolean;
	members: { userId: string; email: string; name: string; role: Role }[];
	invitations: { id: string; email: string; role: Role; expiresAt: Date }[];
	sites: { id: string; slug: string; name: string; visibility: 'public' | 'members'; updatedAt: Date }[];
}

// A committee's page: its members see it; the team sees any
export async function getCommittee(id: string, user: CurrentUser | null): Promise<CommitteeDetail> {
	if (!user) error(401, 'Sign in to see committees');
	const member = user.memberships.some((m) => m.committeeId === id);
	if (!member && !user.isTeam) error(404, 'Committee not found');
	const [c] = await db.select({ id: committees.id, name: committees.name, isTeam: committees.isTeam }).from(committees).where(eq(committees.id, id));
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

export async function renameCommittee(id: string, user: CurrentUser | null, rawName: string): Promise<void> {
	mustManage(id, user);
	const name = rawName.trim().slice(0, 120);
	if (!name) error(400, 'Give the committee a name');
	await db.update(committees).set({ name }).where(eq(committees.id, id));
}

export async function inviteMember(id: string, user: CurrentUser | null, email: string, role: unknown, origin: string): Promise<void> {
	mustManage(id, user);
	if (role !== 'lead' && role !== 'member') error(400, 'role is lead or member');
	if (!(await invite(id, email, role, user!.id, origin))) error(400, 'That doesn’t look like an email address');
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

// Every committee, for the team's admin page
export async function listCommittees(user: CurrentUser | null) {
	if (!user?.isTeam) error(403, 'Only the Faith & Home team sees every committee');
	return db
		.select({
			id: committees.id,
			name: committees.name,
			isTeam: committees.isTeam,
			createdAt: committees.createdAt,
			members: sql<number>`(select count(*)::int from ${memberships} where ${memberships.committeeId} = ${committees.id})`,
			sites: sql<number>`(select count(*)::int from ${sites} where ${sites.committeeId} = ${committees.id})`,
		})
		.from(committees)
		.orderBy(desc(committees.isTeam), asc(committees.name));
}
