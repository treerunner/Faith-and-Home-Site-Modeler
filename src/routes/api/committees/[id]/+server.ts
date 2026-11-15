import { error, json } from '@sveltejs/kit';
import { updateCommittee } from '#lib/server/committees';
import { siteId as uuid } from '#lib/server/sites';
import type { RequestHandler } from './$types';

// { name, description }: either or both
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { name?: unknown; description?: unknown };
	if (body.name === undefined && body.description === undefined) error(400, 'name or description is required');
	return json(await updateCommittee(uuid(params.id), locals.user, body));
};
