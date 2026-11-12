import { CONTEXT_HALF_SIZE, suggestSiteType, toLatLng, type LatLng } from '../modeler/geo';
import type { ContextSource, Site } from '../modeler/types';
import { fetchOvertureFeatures, parseBuildings, parseRoads, type ContextBuildingData } from './overture';
import { fetchParcels, type ParcelData } from './parcels';

// Everything address mode needs around an origin, in local meters. Fetched once at setup;
// the client saves what it keeps into the Site. (M6.5 terrain slots in here as one more source.)

export interface ContextResponse {
	buildings: ContextBuildingData[];
	roads: { line: [number, number][]; kind: string }[];
	parcels: ParcelData[];
	sources: ContextSource[];
	siteType: NonNullable<Site['siteType']>;
	parcelsFailed: boolean; // the parcel service was down; drawing still works
}

const PARCEL_HALF = 100; // parcels you can pick from: around the address, not the whole board
const FETCH_MARGIN = 20; // buildings straddling the board edge still have their centroid fetched

export async function loadContext(origin: LatLng): Promise<ContextResponse> {
	const half = CONTEXT_HALF_SIZE + FETCH_MARGIN;
	const nw = toLatLng(-half, -half, origin);
	const se = toLatLng(half, half, origin);
	const [overture, parcelResult] = await Promise.all([
		fetchOvertureFeatures({ west: nw.lng, north: nw.lat, east: se.lng, south: se.lat }),
		fetchParcels(origin, PARCEL_HALF).catch((e) => {
			console.error('parcel source failed', e);
			return null;
		}),
	]);
	const buildings = parseBuildings(overture.buildings, origin, CONTEXT_HALF_SIZE);
	return {
		buildings,
		roads: parseRoads(overture.roads, origin, CONTEXT_HALF_SIZE),
		parcels: parcelResult?.parcels ?? [],
		sources: ['overture', ...(parcelResult?.source ? [parcelResult.source] : [])],
		siteType: suggestSiteType(buildings, CONTEXT_HALF_SIZE),
		parcelsFailed: parcelResult === null,
	};
}
