import { json } from '@sveltejs/kit';
import { duplicateSite, siteId } from '#lib/server/sites';
import type { RequestHandler } from './$types';

// Copies a site with all its plans, into its committee or { committeeId }
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { committeeId?: unknown };
	return json(await duplicateSite(siteId(params.id), locals.user, typeof body.committeeId === 'string' ? body.committeeId : undefined), { status: 201 });
};
