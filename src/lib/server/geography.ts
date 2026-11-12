import { sql, type SQL } from 'drizzle-orm';
import { toLatLng } from '../modeler/geo';
import type { Site } from '../modeler/types';

// Converts a site's origin and parcel to WKT in lng/lat for the PostGIS columns.
// Converting only here keeps the rest of the app in local meters (CLAUDE.md).
export function siteWkt(site: Site): { origin: string | null; parcel: string | null } {
	if (site.mode !== 'address' || !site.origin) return { origin: null, parcel: null };
	const origin = site.origin;
	const fmt = (lng: number, lat: number) => `${lng.toFixed(8)} ${lat.toFixed(8)}`;
	let parcel: string | null = null;
	if (site.parcel && site.parcel.length >= 3) {
		const ring = site.parcel.map(([x, y]) => toLatLng(x, y, origin));
		parcel = `POLYGON((${[...ring, ring[0]].map((p) => fmt(p.lng, p.lat)).join(', ')}))`;
	}
	return { origin: `POINT(${fmt(origin.lng, origin.lat)})`, parcel };
}

// Column values for sites.origin and sites.parcel
export function siteGeography(site: Site): { origin: SQL | null; parcel: SQL | null } {
	const wkt = siteWkt(site);
	return {
		origin: wkt.origin ? sql`ST_GeogFromText(${wkt.origin})` : null,
		// A drawn outline can cross itself; repair it rather than fail the save
		parcel: wkt.parcel ? sql`ST_MakeValid(ST_GeomFromText(${wkt.parcel}, 4326))::geography` : null,
	};
}
