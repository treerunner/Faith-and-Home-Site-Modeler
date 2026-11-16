// Runs the database migrations in drizzle/ with drizzle-orm's own migrator (a runtime
// dependency), so production needs no drizzle-kit. Railway runs it before each deploy goes live
// (railway.json); a failed migration stops the deploy and the running version stays up.
// Locally it reads DATABASE_URL from .env, like drizzle.config.ts.
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
	await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
	console.log('Migrations up to date');
} finally {
	await client.end();
}
