import { json } from '@sveltejs/kit';
import { deleteSite, getSite, saveSite, siteId } from '#lib/server/sites';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => json(await getSite(siteId(params.id)));

export const PUT: RequestHandler = async ({ params, request }) =>
	json(await saveSite(siteId(params.id), await request.json()));

export const DELETE: RequestHandler = async ({ params }) => {
	await deleteSite(siteId(params.id));
	return new Response(null, { status: 204 });
};
