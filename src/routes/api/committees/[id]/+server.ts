import { error, json } from '@sveltejs/kit';
import { renameCommittee } from '#lib/server/committees';
import { siteId as uuid } from '#lib/server/sites';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { name?: unknown };
	if (typeof body.name !== 'string') error(400, 'name is required');
	await renameCommittee(uuid(params.id), locals.user, body.name);
	return json({ ok: true });
};
