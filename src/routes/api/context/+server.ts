import { error, json } from '@sveltejs/kit';
import { loadContext } from '#lib/server/context';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
		error(400, 'lat and lng are required');
	}
	try {
		return json(await loadContext({ lat, lng }));
	} catch (e) {
		console.error('context failed', e);
		error(502, 'Could not load the neighborhood. Try again in a moment.');
	}
};
