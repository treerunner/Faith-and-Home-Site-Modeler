import { error, json } from '@sveltejs/kit';
import { setAllowNewCommittees } from '#lib/server/committees';
import type { RequestHandler } from './$types';

// { allowNewCommittees }
export const PUT: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { allowNewCommittees?: unknown };
	if (typeof body.allowNewCommittees !== 'boolean') error(400, 'allowNewCommittees is required');
	await setAllowNewCommittees(locals.user, body.allowNewCommittees);
	return json({ ok: true });
};
