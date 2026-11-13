import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from './store.svelte';
import { normalizeSite } from './serialize';
import type { ContextResponse } from './address';

// A 300 m board (the default) at 5 m: 61 x 61 points, rising to the south
const terrain = { spacing: 5, heights: Array.from({ length: 61 * 61 }, (_, k) => 100 + Math.floor(k / 61) / 4) };
const context: ContextResponse = { buildings: [], roads: [], parcels: [], sources: ['overture'], buildingSources: [], parcelsFailed: false };
const place = { label: '1 Church St', lat: 40.6, lng: -75.4, precise: true };

function respondWith(body: unknown, status = 200) {
	const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('terrain in the store', () => {
	beforeEach(() => store.newSite());
	afterEach(() => vi.unstubAllGlobals());

	it('loads terrain for the board when an address is set up', async () => {
		const fetch = respondWith({ terrain });
		store.startAddress(place, context);
		expect(store.terrainState).toBe('loading');
		await settle();
		expect(String(fetch.mock.calls[0][0])).toContain('/api/terrain?lat=40.6&lng=-75.4&half=150');
		expect(store.site.context.terrain).toEqual(terrain);
		expect(store.terrainState).toBe('idle');
	});

	it('leaves the board flat where there is no elevation data', async () => {
		respondWith({ terrain: null });
		store.startAddress(place, context);
		await settle();
		expect(store.site.context.terrain).toBeUndefined();
		expect(store.terrainState).toBe('failed');
	});

	it('also stays flat when the service fails', async () => {
		respondWith({ message: 'No elevation data here.' }, 502);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		store.startAddress(place, context);
		await settle();
		expect(store.terrainState).toBe('failed');
	});

	it('drops terrain that arrives after the address was cleared', async () => {
		respondWith({ terrain });
		store.startAddress(place, context);
		store.clearAddress();
		await settle();
		expect(store.site.context.terrain).toBeUndefined();
		expect(store.terrainState).toBe('idle');
	});

	it('does nothing on a grid site', async () => {
		const fetch = respondWith({ terrain });
		await store.loadTerrain();
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('terrain in saved sites', () => {
	const saved = (t: unknown, halfSize?: number) =>
		normalizeSite({ id: 's', name: 'S', mode: 'address', context: { buildings: [], roads: [], halfSize, terrain: t }, plans: [{ id: 'p', name: 'P', structures: [], openSpaces: [], trees: [], annotations: [] }] }).context.terrain;

	it('keeps a grid that spans the board', () => {
		expect(saved(terrain)).toEqual(terrain);
		expect(saved({ spacing: 10, heights: Array(81 * 81).fill(100) }, 400)).toBeDefined();
	});

	it('drops malformed terrain, so the board loads flat', () => {
		expect(saved(undefined)).toBeUndefined();
		expect(saved({ spacing: 5, heights: [1, 2, 3] })).toBeUndefined(); // not square
		expect(saved({ spacing: 5, heights: Array(41 * 41).fill(100) })).toBeUndefined(); // doesn't span 300 m
		expect(saved({ spacing: 5, heights: [...terrain.heights.slice(1), null] })).toBeUndefined();
		expect(saved({ spacing: 0, heights: terrain.heights })).toBeUndefined();
	});
});
