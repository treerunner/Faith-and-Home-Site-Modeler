import { error, json } from '@sveltejs/kit';
import { geocode } from '#lib/server/geocode';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) error(400, 'q is required');
	try {
		return json(await geocode(q));
	} catch (e) {
		console.error('geocode failed', e);
		error(502, 'Address lookup is unavailable');
	}
};
