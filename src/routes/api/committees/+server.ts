import { error, json } from '@sveltejs/kit';
import { createCommittee } from '#lib/server/committees';
import type { RequestHandler } from './$types';

// Starts a committee, with the signed-in user as its lead: { name }
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { name?: unknown };
	if (typeof body.name !== 'string') error(400, 'name is required');
	return json({ id: await createCommittee(locals.user, body.name) }, { status: 201 });
};
