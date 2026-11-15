import { redirect } from '@sveltejs/kit';
import { consumeSignIn, startSession } from '#lib/server/auth';
import type { RequestHandler } from './$types';

// The link in a sign-in email: signs you in once, then goes where you were headed
export const GET: RequestHandler = async ({ url, cookies }) => {
	const done = await consumeSignIn(url.searchParams.get('token') ?? '');
	if (!done) redirect(303, '/signin?expired=1');
	await startSession(cookies, done.userId, url.protocol === 'https:');
	redirect(303, done.next);
};
