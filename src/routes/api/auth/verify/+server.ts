import { error, json } from '@sveltejs/kit';
import { consumeSignIn, startSession } from '#lib/server/auth';
import type { RequestHandler } from './$types';

// Uses a sign-in link: { token }. A POST, pressed by a person on /auth/verify, so mail scanners
// that open links to check them can't use it up.
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const { token } = (await request.json()) as { token?: unknown };
	const done = typeof token === 'string' ? await consumeSignIn(token) : null;
	if (!done) error(410, 'That link has expired or was already used. Ask for a new one.');
	await startSession(cookies, done.userId, url.protocol === 'https:');
	return json({ next: done.next });
};
