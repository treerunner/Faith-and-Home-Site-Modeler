import { json } from '@sveltejs/kit';
import { duplicateSite, siteId } from '#lib/server/sites';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) =>
	json(await duplicateSite(siteId(params.id)), { status: 201 });
