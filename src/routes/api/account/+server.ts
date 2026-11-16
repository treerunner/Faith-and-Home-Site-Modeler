import { error, json } from '@sveltejs/kit';
import { setName } from '#lib/server/auth';
import type { RequestHandler } from './$types';

// Your own account only: { name }
export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in first');
	const body = (await request.json()) as { name?: unknown };
	if (typeof body.name !== 'string') error(400, 'name is required');
	await setName(locals.user, body.name);
	return json({ ok: true });
};
