import { error, json } from '@sveltejs/kit';
import { requestSignIn } from '#lib/server/auth';
import type { RequestHandler } from './$types';

// Sends a sign-in link. The answer is the same whether or not the address has an account.
export const POST: RequestHandler = async ({ request, url }) => {
	const body = (await request.json()) as { email?: unknown; next?: unknown };
	if (typeof body.email !== 'string') error(400, 'email is required');
	let ok: boolean;
	try {
		ok = await requestSignIn(body.email, typeof body.next === 'string' ? body.next : null, url.origin);
	} catch (e) {
		console.error('Sign-in email failed:', e);
		error(502, 'We couldn’t send the email just now. Try again in a few minutes.');
	}
	if (!ok) error(400, 'That doesn’t look like an email address');
	return json({ ok: true });
};
