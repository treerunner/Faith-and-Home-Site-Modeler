import { error, json } from '@sveltejs/kit';
import { loadContext } from '#lib/server/context';
import { CONTEXT_HALF_SIZE, MAX_BOARD_HALF } from '#lib/modeler/geo';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
		error(400, 'lat and lng are required');
	}
	const half = Number(url.searchParams.get('half') ?? CONTEXT_HALF_SIZE);
	if (!Number.isFinite(half) || half < CONTEXT_HALF_SIZE || half > MAX_BOARD_HALF) {
		error(400, `half must be between ${CONTEXT_HALF_SIZE} and ${MAX_BOARD_HALF}`);
	}
	try {
		return json(await loadContext({ lat, lng }, half));
	} catch (e) {
		console.error('context failed', e);
		error(502, 'Could not load the neighborhood. Try again in a moment.');
	}
};
