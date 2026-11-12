import type { FeatureCollection, Geometry } from 'geojson';
import { openRing, toLatLng, toLocal, type LatLng } from '../modeler/geo';
import { polygonArea } from '../modeler/metrics';
import type { ContextSource } from '../modeler/types';
import type { Bounds } from './overture';
import { fetchJson } from './http';
import type { ParcelData } from '../modeler/address';

// Parcels have no free national source, so this is a registry of county services, grown as
// the tool reaches new places. Where nothing covers a site, the user draws the parcel.

type Pt = [number, number];

interface ParcelSource {
	id: ContextSource;
	covers: Bounds; // rough county bounding box; the service decides what is really there
	layerUrl: string; // ArcGIS MapServer/FeatureServer layer that supports f=geojson
	idField: string;
	addressFields: string[]; // joined with spaces
}

const SOURCES: ParcelSource[] = [
	{
		// Lehigh County via PASDA (Penn State). Snapshot of 2021-08; the county's own server blocks automated access.
		id: 'pasda-lehigh',
		covers: { west: -75.94, south: 40.43, east: -75.33, north: 40.8 },
		layerUrl: 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/LehighCounty/MapServer/5',
		idField: 'PIN',
		addressFields: ['SITUS_ADDR', 'SITUS_FDPR', 'SITUS_FNAM', 'SITUS_FTYP', 'SITUS_FDSU'],
	},
];

function largestRing(g: Geometry): Pt[] | null {
	const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
	if (rings.length === 0) return null;
	return openRing(rings.reduce((a, b) => (polygonArea(b as Pt[]) > polygonArea(a as Pt[]) ? b : a)) as Pt[]);
}

export function parseParcels(fc: FeatureCollection, source: Pick<ParcelSource, 'idField' | 'addressFields'>, origin: LatLng): ParcelData[] {
	const parcels: ParcelData[] = [];
	for (const f of fc.features) {
		const ring = f.geometry && largestRing(f.geometry);
		if (!ring || ring.length < 3) continue;
		const p = f.properties ?? {};
		parcels.push({
			id: String(p[source.idField] ?? f.id ?? parcels.length),
			address: source.addressFields
				.map((k) => String(p[k] ?? '').trim())
				.filter(Boolean)
				.join(' '),
			polygon: ring.map(([lng, lat]) => toLocal(lat, lng, origin)),
		});
	}
	return parcels;
}

const overlaps = (a: Bounds, b: Bounds) => a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;

// Parcels within `half` meters of the origin from whichever source covers it, or none.
export async function fetchParcels(origin: LatLng, half: number): Promise<{ parcels: ParcelData[]; source?: ContextSource }> {
	const nw = toLatLng(-half, -half, origin);
	const se = toLatLng(half, half, origin);
	const bounds = { west: nw.lng, north: nw.lat, east: se.lng, south: se.lat };
	const source = SOURCES.find((s) => overlaps(s.covers, bounds));
	if (!source) return { parcels: [] };
	const params = new URLSearchParams({
		geometry: [bounds.west, bounds.south, bounds.east, bounds.north].join(','),
		geometryType: 'esriGeometryEnvelope',
		inSR: '4326',
		spatialRel: 'esriSpatialRelIntersects',
		outFields: [source.idField, ...source.addressFields].join(','),
		returnGeometry: 'true',
		outSR: '4326',
		f: 'geojson',
	});
	const fc = await fetchJson<FeatureCollection>(`${source.layerUrl}/query?${params}`);
	const parcels = parseParcels(fc, source, origin);
	return { parcels, source: parcels.length ? source.id : undefined };
}
