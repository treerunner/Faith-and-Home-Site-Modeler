import postgres from 'postgres';
import type { BrowserContext } from '@playwright/test';
import { hashToken, newToken } from '../../src/lib/server/tokens';

// Test accounts, made directly in the .env database: a user, their committee memberships and a
// session, then the session cookie in the browser. No test-only route in the app.

// The one Node global used here (the project has no Node types)
declare const process: { env: Record<string, string | undefined>; loadEnvFile(path: string): void };

if (!process.env.DATABASE_URL) process.loadEnvFile('.env');
export const sql = postgres(process.env.DATABASE_URL!, { max: 2 });

export const BASE = 'http://localhost:4173';
export const SESSION_COOKIE = 'fh_session';

export interface TestUser {
	id: string;
	email: string;
	cookie: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax'; expires: number };
}

export async function makeUser(label: string, memberships: { committeeId: string; role: 'lead' | 'member' }[] = []): Promise<TestUser> {
	const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
	const [user] = await sql`INSERT INTO users (email, name) VALUES (${email}, ${'E2E ' + label}) RETURNING id`;
	for (const m of memberships) await sql`INSERT INTO memberships (committee_id, user_id, role) VALUES (${m.committeeId}, ${user.id}, ${m.role})`;
	const token = newToken();
	const expires = new Date(Date.now() + 86_400_000);
	await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${await hashToken(token)}, ${user.id}, ${expires})`;
	return {
		id: user.id,
		email,
		cookie: { name: SESSION_COOKIE, value: token, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax', expires: Math.floor(expires.getTime() / 1000) },
	};
}

export async function signIn(context: BrowserContext, user: TestUser) {
	await context.clearCookies();
	await context.addCookies([user.cookie]);
}

export async function makeCommittee(name: string): Promise<string> {
	const [c] = await sql`INSERT INTO committees (name) VALUES (${name}) RETURNING id`;
	return c.id;
}

export async function teamCommitteeId(): Promise<string> {
	const [c] = await sql`SELECT id FROM committees WHERE is_team`;
	return c.id;
}

// Users and committees made by a test go away with it (their sites with the committee)
export async function removeUsers(...ids: string[]) {
	if (ids.length) await sql`DELETE FROM users WHERE id IN ${sql(ids)}`;
}

export async function removeCommittees(...ids: string[]) {
	if (ids.length) await sql`DELETE FROM committees WHERE id IN ${sql(ids)}`;
}
