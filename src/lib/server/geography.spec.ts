import { describe, it, expect } from 'vitest';
import { siteWkt } from './geography';
import type { Site } from '../modeler/types';

const base: Site = { id: 's', name: 'S', mode: 'grid', context: { buildings: [], roads: [] }, plans: [] };
const origin = { lat: 40.5988823, lng: -75.4962986 };

describe('siteWkt', () => {
	it('is empty in grid mode', () => {
		expect(siteWkt(base)).toEqual({ origin: null, parcel: null });
	});

	it('writes the origin as lng lat', () => {
		expect(siteWkt({ ...base, mode: 'address', origin }).origin).toBe('POINT(-75.49629860 40.59888230)');
	});

	it('closes the parcel ring in lng lat', () => {
		const { parcel } = siteWkt({ ...base, mode: 'address', origin, parcel: [[0, 0], [10, 0], [10, 10]] });
		const coords = parcel!.replace(/^POLYGON\(\(|\)\)$/g, '').split(', ');
		expect(coords).toHaveLength(4);
		expect(coords[0]).toBe(coords[3]);
		expect(coords[0]).toBe('-75.49629860 40.59888230');
		// 10 m east is a larger longitude; 10 m "south" (+y) is a smaller latitude
		const [lng1] = coords[1].split(' ').map(Number);
		const [, lat2] = coords[2].split(' ').map(Number);
		expect(lng1).toBeGreaterThan(origin.lng);
		expect(lat2).toBeLessThan(origin.lat);
	});
});
