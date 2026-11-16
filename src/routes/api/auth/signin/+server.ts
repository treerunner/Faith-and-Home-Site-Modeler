import { error, json } from '@sveltejs/kit';
import { requestSignIn, TooManyLinks } from '#lib/server/auth';
import { limiter } from '#lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Per network address: 10 requests every 15 minutes (each address also gets at most 3 links)
const perIp = limiter(10, 15 * 60_000);
const WAIT = 'Too many sign-in links were asked for. Check your email for the last one, or try again in 15 minutes.';

// Sends a sign-in link. The answer is the same whether or not the address has an account.
export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!perIp(getClientAddress())) error(429, WAIT);
	const body = (await request.json()) as { email?: unknown; next?: unknown };
	if (typeof body.email !== 'string') error(400, 'email is required');
	let ok: boolean;
	try {
		ok = await requestSignIn(body.email, typeof body.next === 'string' ? body.next : null, url.origin);
	} catch (e) {
		if (e instanceof TooManyLinks) error(429, WAIT);
		console.error('Sign-in email failed:', e);
		error(502, 'We couldn’t send the email just now. Try again in a few minutes.');
	}
	if (!ok) error(400, 'That doesn’t look like an email address');
	return json({ ok: true });
};
