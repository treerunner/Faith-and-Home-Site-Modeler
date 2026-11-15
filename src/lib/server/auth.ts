import type { Cookies } from '@sveltejs/kit';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './db';
import { committees, invitations, loginTokens, memberships, sessions, users } from './db/schema';
import { sendEmail } from './email';
import { days, hashToken, minutes, newToken, normalEmail, safeNext } from './tokens';
import type { Role } from './access';

// Accounts: sign in by email link, stay signed in with a session cookie. No passwords.

export interface CurrentUser {
	id: string;
	email: string;
	name: string;
	isTeam: boolean;
	memberships: { committeeId: string; committeeName: string; role: Role }[];
}

export const SESSION_COOKIE = 'fh_session';
const SESSION_DAYS = 30;

// ── Sign-in links ────────────────────────────────────────────────────────────

export async function requestSignIn(rawEmail: string, next: string | null, origin: string): Promise<boolean> {
	const email = normalEmail(rawEmail);
	if (!email) return false;
	const token = newToken();
	await db.insert(loginTokens).values({ tokenHash: await hashToken(token), email, next: safeNext(next), expiresAt: minutes(15) });
	const link = `${origin}/auth/verify?token=${token}`;
	await sendEmail({
		to: email,
		subject: 'Sign in to the Faith & Home site modeler',
		text: `Use this link to sign in. It works once, for 15 minutes.\n\n${link}\n\nIf you didn't ask to sign in, you can ignore this email.`,
		html: `<p>Use this link to sign in. It works once, for 15 minutes.</p><p><a href="${link}">Sign in to the site modeler</a></p><p>If you didn't ask to sign in, you can ignore this email.</p>`,
	});
	return true;
}

// Uses a sign-in link once: the user (created on first sign-in) and where to go next
export async function consumeSignIn(token: string): Promise<{ userId: string; next: string } | null> {
	const [row] = await db
		.update(loginTokens)
		.set({ usedAt: new Date() })
		.where(and(eq(loginTokens.tokenHash, await hashToken(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
		.returning({ email: loginTokens.email, next: loginTokens.next });
	if (!row) return null;
	return { userId: await userFor(row.email), next: row.next };
}

async function userFor(email: string): Promise<string> {
	const [user] = await db.insert(users).values({ email }).onConflictDoUpdate({ target: users.email, set: { email } }).returning({ id: users.id });
	return user.id;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function startSession(cookies: Cookies, userId: string, secure: boolean): Promise<void> {
	const token = newToken();
	const expiresAt = days(SESSION_DAYS);
	await db.insert(sessions).values({ id: await hashToken(token), userId, expiresAt });
	cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, expires: expiresAt });
}

export async function endSession(cookies: Cookies): Promise<void> {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(sessions).where(eq(sessions.id, await hashToken(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

// The signed-in user for a session cookie, with their committees; sessions in their last half
// are extended, so people who keep using the tool stay signed in
export async function readSession(cookies: Cookies, secure: boolean): Promise<CurrentUser | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const id = await hashToken(token);
	const [row] = await db
		.select({ userId: sessions.userId, expiresAt: sessions.expiresAt, email: users.email, name: users.name })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
	if (!row) {
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return null;
	}
	if (row.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * 86_400_000) {
		const expiresAt = days(SESSION_DAYS);
		await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
		await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, row.userId));
		cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, expires: expiresAt });
	}
	const rows = await db
		.select({ committeeId: memberships.committeeId, committeeName: committees.name, role: memberships.role, isTeam: committees.isTeam })
		.from(memberships)
		.innerJoin(committees, eq(committees.id, memberships.committeeId))
		.where(eq(memberships.userId, row.userId));
	return {
		id: row.userId,
		email: row.email,
		name: row.name,
		isTeam: rows.some((m) => m.isTeam),
		memberships: rows.map(({ isTeam: _, ...m }) => m),
	};
}

// ── Invitations ──────────────────────────────────────────────────────────────

export async function invite(committeeId: string, rawEmail: string, role: Role, invitedBy: string, origin: string): Promise<boolean> {
	const email = normalEmail(rawEmail);
	if (!email) return false;
	const [committee] = await db.select({ name: committees.name }).from(committees).where(eq(committees.id, committeeId));
	if (!committee) return false;
	const token = newToken();
	await db.insert(invitations).values({ committeeId, email, role, tokenHash: await hashToken(token), invitedBy, expiresAt: days(14) });
	const link = `${origin}/auth/invite?token=${token}`;
	await sendEmail({
		to: email,
		subject: `You're invited to ${committee.name} on the Faith & Home site modeler`,
		text: `You've been invited to join ${committee.name}, to work on its sites and plans together.\n\nAccept and sign in (the link works for 14 days):\n${link}`,
		html: `<p>You've been invited to join <strong>${escapeHtml(committee.name)}</strong>, to work on its sites and plans together.</p><p><a href="${link}">Accept and sign in</a> (the link works for 14 days)</p>`,
	});
	return true;
}

// Accepts an invitation: signs the invited person in (creating their account) and adds them
export async function acceptInvitation(token: string): Promise<{ userId: string; committeeId: string } | null> {
	const [inv] = await db
		.update(invitations)
		.set({ acceptedAt: new Date() })
		.where(and(eq(invitations.tokenHash, await hashToken(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
		.returning({ committeeId: invitations.committeeId, email: invitations.email, role: invitations.role });
	if (!inv) return null;
	const userId = await userFor(inv.email);
	// Joining never demotes: an existing lead stays a lead
	await db
		.insert(memberships)
		.values({ committeeId: inv.committeeId, userId, role: inv.role })
		.onConflictDoNothing();
	if (inv.role === 'lead') {
		await db.update(memberships).set({ role: 'lead' }).where(and(eq(memberships.committeeId, inv.committeeId), eq(memberships.userId, userId)));
	}
	return { userId, committeeId: inv.committeeId };
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
