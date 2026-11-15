import type { Handle } from '@sveltejs/kit/hooks';
import { readSession } from '#lib/server/auth';

// Who's signed in, for every request: `locals.user`, or null
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSession(event.cookies, event.url.protocol === 'https:');
	return resolve(event);
};
