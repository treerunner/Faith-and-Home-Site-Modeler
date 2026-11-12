import { fetchJson } from './http';

// Address search. Photon (OpenStreetMap, global, built for typeahead) suggests as you type;
// the US Census geocoder (public domain) resolves free text that Photon can't place exactly.

export interface Suggestion {
	label: string;
	lat: number;
	lng: number;
	precise: boolean; // a building, a place, or a house-number point; street-level results are not
}

// Biases suggestions toward the Lehigh Valley without excluding anywhere else
const BIAS = { lat: 40.62, lng: -75.42 };

interface PhotonResponse {
	features: { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }[];
}

export function parsePhoton(res: PhotonResponse): Suggestion[] {
	const seen = new Set<string>();
	return res.features
		.map(({ properties: p, geometry }) => {
			const street = [p.housenumber, p.street].filter(Boolean).join(' ');
			const place = [p.city ?? p.town ?? p.village ?? p.county, [p.state, p.postcode].filter(Boolean).join(' ')]
				.filter(Boolean)
				.join(', ');
			// A named place (a church, a school) leads with its name
			const head = p.name && p.name !== p.street ? [p.name, street].filter(Boolean).join(', ') : street || p.name;
			return {
				label: [head, place].filter(Boolean).join(', '),
				lng: geometry.coordinates[0],
				lat: geometry.coordinates[1],
				precise: Boolean(p.housenumber) || (p.osm_key !== 'highway' && p.osm_key !== 'place' && p.osm_key !== 'boundary'),
			};
		})
		.filter((s) => s.label && !seen.has(s.label) && seen.add(s.label));
}

export async function suggest(q: string): Promise<Suggestion[]> {
	const params = new URLSearchParams({ q, limit: '6', lang: 'en', lat: String(BIAS.lat), lon: String(BIAS.lng) });
	return parsePhoton(await fetchJson<PhotonResponse>(`https://photon.komoot.io/api/?${params}`, {}, 8000));
}

interface CensusResponse {
	result: { addressMatches: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
}

export function parseCensus(res: CensusResponse): Suggestion | null {
	const m = res.result.addressMatches[0];
	return m ? { label: m.matchedAddress, lat: m.coordinates.y, lng: m.coordinates.x, precise: true } : null;
}

export async function geocode(q: string): Promise<Suggestion | null> {
	const params = new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' });
	return parseCensus(
		await fetchJson<CensusResponse>(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`),
	);
}
