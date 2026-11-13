import type { Tags } from './geo';
import type { ContextSource } from './types';

// Shapes shared by the address-mode endpoints and the browser, plus the browser-side calls.

type Pt = [number, number];

export interface Suggestion {
	label: string;
	lat: number;
	lng: number;
	precise: boolean; // a building, a place, or a house-number point; street-level results are not
}

export interface ContextBuildingData {
	id: string;
	polygon: Pt[]; // local meters
	height: number; // for foam
	tags: Tags; // OSM-style tags for storiesFromTags when prefilling structures
	name?: string;
}

export interface ParcelData {
	id: string;
	address: string;
	polygon: Pt[]; // local meters
}

export interface ContextResponse {
	buildings: ContextBuildingData[];
	roads: { line: Pt[]; kind: string }[];
	parcels: ParcelData[];
	sources: ContextSource[];
	parcelsFailed: boolean; // the parcel service was down; drawing still works
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	const res = await fetch(url, { signal });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(body?.message ?? `Request failed (${res.status})`);
	}
	return (await res.json()) as T;
}

export const fetchSuggestions = (q: string, signal?: AbortSignal) =>
	getJson<Suggestion[]>(`/api/geocode/suggest?${new URLSearchParams({ q })}`, signal);

export const fetchGeocode = (q: string) => getJson<Suggestion | null>(`/api/geocode?${new URLSearchParams({ q })}`);

export const fetchContext = (lat: number, lng: number, half?: number) =>
	getJson<ContextResponse>(
		`/api/context?${new URLSearchParams({ lat: String(lat), lng: String(lng), ...(half ? { half: String(half) } : {}) })}`,
	);
