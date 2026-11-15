import { readFileSync } from 'node:fs';
import { removeUsers, sql } from './auth';

export default async function globalTeardown() {
	const { id } = JSON.parse(readFileSync('.playwright/team-user.json', 'utf8')) as { id: string };
	await removeUsers(id);
	// Users left by interrupted runs
	await sql`DELETE FROM users WHERE email LIKE 'e2e-%@example.test' AND created_at < now() - interval '1 hour'`;
	await sql.end();
}
