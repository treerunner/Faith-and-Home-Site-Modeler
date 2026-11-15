import { redirect } from '@sveltejs/kit';
import { acceptInvitation, startSession } from '#lib/server/auth';
import type { RequestHandler } from './$types';

// The link in an invitation: joins the committee and signs you in
export const GET: RequestHandler = async ({ url, cookies }) => {
	const done = await acceptInvitation(url.searchParams.get('token') ?? '');
	if (!done) redirect(303, '/signin?invite=expired');
	await startSession(cookies, done.userId, url.protocol === 'https:');
	redirect(303, `/committees/${done.committeeId}`);
};
