import type { Handle } from '@sveltejs/kit/hooks';
import { EMAIL_FROM, RAILWAY_ENVIRONMENT_NAME, RESEND_API_KEY } from '$app/env/private';
import { readSession } from '#lib/server/auth';

// Deployed, sign-in emails must really go out: without these the app would only print links to
// its log. Refusing to start makes the deploy fail visibly; the running version stays up.
if (RAILWAY_ENVIRONMENT_NAME && (!RESEND_API_KEY || !EMAIL_FROM)) {
	throw new Error('RESEND_API_KEY and EMAIL_FROM must be set on Railway (see docs/DEPLOY.md)');
}

// Who's signed in, for every request: `locals.user`, or null
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSession(event.cookies, event.url.protocol === 'https:');
	return resolve(event);
};
