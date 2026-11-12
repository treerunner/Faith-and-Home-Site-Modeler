import { error, json } from '@sveltejs/kit';
import { suggest } from '#lib/server/geocode';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 3) return json([]);
	try {
		return json(await suggest(q));
	} catch (e) {
		console.error('suggest failed', e);
		error(502, 'Address suggestions are unavailable');
	}
};
