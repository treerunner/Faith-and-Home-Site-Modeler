import { error, json } from '@sveltejs/kit';
import { acceptInvitation, peekInvitation, startSession } from '#lib/server/auth';
import type { RequestHandler } from './$types';

// What an invitation is for (the page shows it before you accept): ?token=
export const GET: RequestHandler = async ({ url }) => {
	const found = await peekInvitation(url.searchParams.get('token') ?? '');
	if (!found) error(410, 'That invitation has expired or was already used.');
	return json(found);
};

// Accepts it: { token }. Pressed by a person, so mail scanners can't use it up.
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const { token } = (await request.json()) as { token?: unknown };
	const done = typeof token === 'string' ? await acceptInvitation(token) : null;
	if (!done) error(410, 'That invitation has expired or was already used. Ask your committee lead for a new one.');
	await startSession(cookies, done.userId, url.protocol === 'https:');
	return json({ slug: done.committeeSlug });
};
