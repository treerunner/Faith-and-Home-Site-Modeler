import { error, json } from '@sveltejs/kit';
import { fetchTerrain } from '#lib/server/elevation';
import { CONTEXT_HALF_SIZE, MAX_BOARD_HALF } from '#lib/modeler/geo';
import type { RequestHandler } from './$types';

// Elevation for a board, apart from /api/context so setup never waits on it.
// { terrain: null } where there is no elevation data; 502 when the service fails.
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
		return json({ terrain: await fetchTerrain({ lat, lng }, half) });
	} catch (e) {
		console.error('terrain failed', e);
		error(502, 'No elevation data here.');
	}
};
