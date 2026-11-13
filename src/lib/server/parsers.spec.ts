import { describe, it, expect } from 'vitest';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { parseBuildings, parseRoads, overtureTags } from './overture';
import { parsePhoton, parseCensus } from './geocode';
import { parseParcels } from './parcels';
import { pointInPolygon, polygonCentroid, toLocal, storiesFromTags } from '../modeler/geo';
import { polygonArea } from '../modeler/metrics';
import church from './fixtures/overture-church.json';
import tileEdge from './fixtures/overture-tile-edge.json';
import photon from './fixtures/photon.json';
import census from './fixtures/census.json';
import pasda from './fixtures/pasda-parcels.json';

// Fixtures were captured live in Nov 2026 around the Cathedral of St. Catharine of Siena,
// Allentown (Lehigh County), and across the edge of Overture tile z14/4756/6166.

type Fixture = { origin: { lat: number; lng: number }; half: number; buildings: Feature[]; roads: Feature[] };
const churchFx = church as unknown as Fixture;
const edgeFx = tileEdge as unknown as Fixture;

// Where Photon puts the cathedral: on the building itself
const CATHEDRAL = { lat: 40.5988823, lng: -75.4962986 };

describe('parseBuildings', () => {
	const buildings = parseBuildings(churchFx.buildings, churchFx.origin, churchFx.half);

	it('finds the cathedral with its name, class and height', () => {
		const cathedral = buildings.find((b) => b.name?.includes('Cathedral'));
		expect(cathedral).toBeDefined();
		expect(cathedral!.tags.building).toBe('cathedral');
		expect(cathedral!.source).toBe('OpenStreetMap'); // recorded for credits
		expect(cathedral!.height).toBeCloseTo(8.6, 1);
		expect(storiesFromTags(cathedral!.tags)).toMatchObject({ stories: 1, source: 'data' });
		// Its outline contains the point Photon gives for it
		expect(pointInPolygon(toLocal(CATHEDRAL.lat, CATHEDRAL.lng, churchFx.origin), cathedral!.polygon)).toBe(true);
	});

	it('keeps only buildings centered on the board, in local meters', () => {
		expect(buildings.length).toBeGreaterThan(10);
		for (const b of buildings) {
			const [cx, cy] = polygonCentroid(b.polygon);
			expect(Math.abs(cx)).toBeLessThanOrEqual(churchFx.half);
			expect(Math.abs(cy)).toBeLessThanOrEqual(churchFx.half);
			expect(b.height).toBeGreaterThan(0);
		}
	});

	it('merges buildings cut at a tile edge back into one', () => {
		const pieces = new Map<string, number>();
		for (const f of edgeFx.buildings) pieces.set(String(f.properties?.id), (pieces.get(String(f.properties?.id)) ?? 0) + 1);
		const split = [...pieces].filter(([, n]) => n > 1).map(([id]) => id);
		expect(split.length).toBeGreaterThan(0);

		const merged = parseBuildings(edgeFx.buildings, edgeFx.origin, 1000);
		expect(new Set(merged.map((b) => b.id)).size).toBe(merged.length);
		// Tiles overlap by a small buffer, so a building near the edge can arrive whole in one tile
		// and as a sliver in the other; only genuinely cut ones grow when merged.
		let genuinelyCut = 0;
		for (const id of split) {
			const whole = merged.find((b) => b.id === id)!;
			const pieceAreas = edgeFx.buildings
				.filter((f) => String(f.properties?.id) === id)
				.map((f) => polygonArea((f.geometry as Polygon).coordinates[0].map(([lng, lat]) => toLocal(lat, lng, edgeFx.origin))));
			// The merged outline covers every piece, and is no bigger than the pieces combined
			const area = polygonArea(whole.polygon);
			expect(area).toBeGreaterThanOrEqual(Math.max(...pieceAreas) - 1e-6);
			expect(area).toBeLessThanOrEqual(pieceAreas.reduce((a, b) => a + b) + 0.5);
			if (area > Math.max(...pieceAreas) + 1) genuinelyCut++;
		}
		expect(genuinelyCut).toBeGreaterThan(0);
	});
});

describe('overtureTags', () => {
	it('maps Overture attributes onto OSM tag names', () => {
		expect(overtureTags({ class: 'church', height: 8.5923, num_floors: 2 })).toEqual({ building: 'church', height: '8.6', 'building:levels': '2' });
		expect(overtureTags({})).toEqual({ building: 'yes', height: undefined, 'building:levels': undefined });
	});
});

describe('parseRoads', () => {
	const roads = parseRoads(churchFx.roads, churchFx.origin, churchFx.half);

	it('keeps streets clipped to the board', () => {
		expect(roads.length).toBeGreaterThan(0);
		for (const r of roads) {
			expect(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']).toContain(r.kind);
			for (const [x, y] of r.line) {
				expect(Math.abs(x)).toBeLessThanOrEqual(churchFx.half + 1e-6);
				expect(Math.abs(y)).toBeLessThanOrEqual(churchFx.half + 1e-6);
			}
		}
	});
});

describe('parsePhoton', () => {
	it('leads with a place name and treats buildings as precise', () => {
		const [s] = parsePhoton(photon as never);
		expect(s.label).toBe('The Cathedral Church of Saint Catherine of Siena, 1825 Turner Street, Allentown, Pennsylvania 18104');
		expect(s.precise).toBe(true);
		expect(s.lat).toBeCloseTo(CATHEDRAL.lat, 6);
	});

	it('marks street results imprecise and drops duplicates', () => {
		const street = { properties: { osm_key: 'highway', street: undefined, name: 'Memorial Drive West', city: 'Bethlehem', state: 'Pennsylvania', postcode: '18015' }, geometry: { coordinates: [-75.38, 40.607] as [number, number] } };
		const out = parsePhoton({ features: [street, street] });
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ label: 'Memorial Drive West, Bethlehem, Pennsylvania 18015', precise: false });
	});
});

describe('parseCensus', () => {
	it('reads the first match', () => {
		expect(parseCensus(census as never)).toEqual({ label: '1825 W TURNER ST, ALLENTOWN, PA, 18104', lat: 40.598598364469, lng: -75.496667770063, precise: true });
	});

	it('returns null without a match', () => {
		expect(parseCensus({ result: { addressMatches: [] } })).toBeNull();
	});
});

describe('parseParcels', () => {
	const parcels = parseParcels(pasda as FeatureCollection, { idField: 'PIN', addressFields: ['SITUS_ADDR', 'SITUS_FDPR', 'SITUS_FNAM', 'SITUS_FTYP', 'SITUS_FDSU'] }, churchFx.origin);

	it('finds the cathedral parcel with its PIN and address', () => {
		const here = toLocal(CATHEDRAL.lat, CATHEDRAL.lng, churchFx.origin);
		const parcel = parcels.find((p) => pointInPolygon(here, p.polygon));
		expect(parcel).toBeDefined();
		expect(parcel!.id).toMatch(/^\d{12}$/);
		expect(parcel!.address).toContain('TURNER');
		expect(polygonArea(parcel!.polygon)).toBeGreaterThan(1000);
	});
});
