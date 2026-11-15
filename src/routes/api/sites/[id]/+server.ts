import { json } from '@sveltejs/kit';
import { deleteSite, getSite, saveSite, siteId, updateSiteSettings } from '#lib/server/sites';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => json(await getSite(siteId(params.id), locals.user));

export const PUT: RequestHandler = async ({ params, request, locals }) =>
	json(await saveSite(siteId(params.id), await request.json(), locals.user));

// Site settings: { visibility } or { committeeId } to move it
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await updateSiteSettings(siteId(params.id), await request.json(), locals.user);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await deleteSite(siteId(params.id), locals.user);
	return new Response(null, { status: 204 });
};
