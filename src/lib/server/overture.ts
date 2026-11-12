import { PMTiles, FetchSource } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import polygonClipping from 'polygon-clipping';
import type { Feature, Geometry } from 'geojson';
import {
	clipLineToBoard,
	contextHeight,
	openRing,
	polygonCentroid,
	toLocal,
	type LatLng,
	type Tags,
} from '../modeler/geo';
import { polygonArea } from '../modeler/metrics';
import { USER_AGENT } from './http';

// Buildings and roads from Overture Maps, read straight from its global PMTiles archives
// with HTTP range requests (a few per tile; no import, works anywhere Overture covers).
// Update the release from https://docs.overturemaps.org/release-calendar/ every few months;
// old releases are eventually removed.
export const OVERTURE_RELEASE = '2026-10-21.0';
const BASE = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${OVERTURE_RELEASE}`;
const ZOOM = 14; // the archives' max zoom: ~0.45 m precision at this latitude

// Module-level so directory lookups are cached across requests
const archives = {
	buildings: new PMTiles(new FetchSource(`${BASE}/buildings.pmtiles`, new Headers({ 'User-Agent': USER_AGENT }))),
	transportation: new PMTiles(new FetchSource(`${BASE}/transportation.pmtiles`, new Headers({ 'User-Agent': USER_AGENT }))),
};

type Pt = [number, number];

export interface Bounds {
	west: number;
	south: number;
	east: number;
	north: number;
}

function tileRange(b: Bounds, z: number) {
	const n = 2 ** z;
	const x = (lng: number) => Math.floor(((lng + 180) / 360) * n);
	const y = (lat: number) =>
		Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
	return { x0: x(b.west), x1: x(b.east), y0: y(b.north), y1: y(b.south) };
}

// GeoJSON features (lng/lat) from one layer of every tile touching the bounds.
async function readLayer(archive: PMTiles, layer: string, bounds: Bounds): Promise<Feature[]> {
	const { x0, x1, y0, y1 } = tileRange(bounds, ZOOM);
	const jobs: Promise<Feature[]>[] = [];
	for (let x = x0; x <= x1; x++) {
		for (let y = y0; y <= y1; y++) {
			jobs.push(
				archive.getZxy(ZOOM, x, y).then((res) => {
					if (!res) return [];
					const tileLayer = new VectorTile(new PbfReader(new Uint8Array(res.data))).layers[layer];
					if (!tileLayer) return [];
					return Array.from({ length: tileLayer.length }, (_, i) => tileLayer.feature(i).toGeoJSON(x, y, ZOOM));
				}),
			);
		}
	}
	return (await Promise.all(jobs)).flat();
}

export async function fetchOvertureFeatures(bounds: Bounds): Promise<{ buildings: Feature[]; roads: Feature[] }> {
	const [buildings, roads] = await Promise.all([
		readLayer(archives.buildings, 'building', bounds),
		readLayer(archives.transportation, 'segment', bounds),
	]);
	return { buildings, roads };
}

// ── Parsing (pure; tested against fixtures) ──────────────────────────────────

export interface ContextBuildingData {
	id: string;
	polygon: Pt[]; // local meters
	height: number; // for foam
	tags: Tags; // OSM-style tags for storiesFromTags when prefilling structures
	name?: string;
}

// Overture properties in the OSM tag names geo.ts already understands
export function overtureTags(p: Record<string, unknown>): Tags {
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : undefined);
	return {
		building: typeof p.class === 'string' ? p.class : 'yes',
		height: num(p.height),
		'building:levels': num(p.num_floors),
	};
}

function outerRings(g: Geometry): Pt[][] {
	if (g.type === 'Polygon') return [g.coordinates[0] as Pt[]];
	if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p[0] as Pt[]);
	return [];
}

// Tiles cut buildings at their edges; pieces share the Overture id, so union them back.
export function parseBuildings(features: Feature[], origin: LatLng, half: number): ContextBuildingData[] {
	const byId = new Map<string, Feature[]>();
	features.forEach((f, i) => {
		if (f.properties?.is_underground) return;
		const id = String(f.properties?.id ?? `anon-${i}`);
		byId.set(id, [...(byId.get(id) ?? []), f]);
	});
	const result: ContextBuildingData[] = [];
	for (const [id, pieces] of byId) {
		const polys = pieces.flatMap((f) => outerRings(f.geometry).map((ring) => [ring] as polygonClipping.Polygon));
		if (polys.length === 0) continue;
		const merged = polys.length === 1 ? [polys[0]] : polygonClipping.union(polys[0], ...polys.slice(1));
		// Largest outer ring of the merged shape (courtyard holes are not modeled)
		const ring = merged
			.map((p) => openRing(p[0] as Pt[]))
			.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
		const polygon = ring.map(([lng, lat]) => toLocal(lat, lng, origin));
		if (polygon.length < 3) continue;
		const [cx, cy] = polygonCentroid(polygon);
		if (Math.abs(cx) > half || Math.abs(cy) > half) continue;
		const props = pieces[0].properties ?? {};
		const tags = overtureTags(props);
		result.push({
			id,
			polygon,
			height: Math.round(contextHeight(tags) * 10) / 10,
			tags,
			name: typeof props['@name'] === 'string' ? props['@name'] : undefined,
		});
	}
	return result;
}

// Printed on the base board: streets only (no footways, rail or water)
const ROAD_CLASSES = new Set([
	'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service',
]);

export function parseRoads(features: Feature[], origin: LatLng, half: number): { line: Pt[]; kind: string }[] {
	const roads: { line: Pt[]; kind: string }[] = [];
	for (const f of features) {
		const kind = String(f.properties?.class ?? '');
		if (f.properties?.subtype !== 'road' || !ROAD_CLASSES.has(kind)) continue;
		const g = f.geometry;
		const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
		for (const coords of lines) {
			const local = coords.map(([lng, lat]) => toLocal(lat, lng, origin));
			for (const line of clipLineToBoard(local, half)) roads.push({ line, kind });
		}
	}
	return roads;
}
