import { CONTEXT_HALF_SIZE, toLatLng, type LatLng } from '../modeler/geo';
import type { ContextResponse } from '../modeler/address';
import { fetchOvertureFeatures, parseBuildings, parseRoads } from './overture';
import { fetchParcels } from './parcels';

// Everything address mode needs around an origin, in local meters. Fetched once at setup;
// the client saves what it keeps into the Site. (M6.5 terrain slots in here as one more source.)

const PARCEL_HALF = 100; // parcels you can pick from: around the address, not the whole board
const FETCH_MARGIN = 20; // buildings straddling the board edge still have their centroid fetched

// `boardHalf` is half the board's width: the default, or larger to fit a big parcel.
export async function loadContext(origin: LatLng, boardHalf = CONTEXT_HALF_SIZE): Promise<ContextResponse> {
	const half = boardHalf + FETCH_MARGIN;
	const nw = toLatLng(-half, -half, origin);
	const se = toLatLng(half, half, origin);
	const [overture, parcelResult] = await Promise.all([
		fetchOvertureFeatures({ west: nw.lng, north: nw.lat, east: se.lng, south: se.lat }),
		fetchParcels(origin, PARCEL_HALF).catch((e) => {
			console.error('parcel source failed', e);
			return null;
		}),
	]);
	const buildings = parseBuildings(overture.buildings, origin, boardHalf);
	return {
		buildings,
		roads: parseRoads(overture.roads, origin, boardHalf),
		parcels: parcelResult?.parcels ?? [],
		sources: ['overture', ...(parcelResult?.source ? [parcelResult.source] : [])],
		buildingSources: [...new Set(buildings.flatMap((b) => (b.source ? [b.source] : [])))].sort(),
		parcelsFailed: parcelResult === null,
	};
}
