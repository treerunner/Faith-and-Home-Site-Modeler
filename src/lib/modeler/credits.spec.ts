import { describe, it, expect } from 'vitest';
import { creditGroups, creditLine } from './credits';
import type { SiteContext } from './types';

const ctx = (overrides: Partial<SiteContext> = {}): SiteContext => ({ buildings: [], roads: [], ...overrides });

describe('credits', () => {
	it('credits nothing on a grid site', () => {
		expect(creditGroups(ctx())).toEqual([]);
		expect(creditLine(ctx())).toBeNull();
	});

	it('credits only the building sources a site uses, plus roads', () => {
		const groups = creditGroups(ctx({ sources: ['overture'], buildingSources: ['Esri Community Maps', 'OpenStreetMap'] }));
		expect(groups.map((g) => g.heading)).toEqual(['Buildings', 'Roads']);
		expect(groups[0].credits).toEqual(['Esri Community Maps (CC BY 4.0)', '© OpenStreetMap contributors (ODbL)', 'via Overture Maps Foundation']);
		expect(groups[1].credits).toContain('Data from TomTom');
	});

	it('credits parcels only when a county parcel was used', () => {
		expect(creditGroups(ctx({ sources: ['overture', 'pasda-lehigh'] })).map((g) => g.heading)).toEqual(['Buildings', 'Roads', 'Parcels']);
	});

	it('falls back to a general line for sites saved before sources were recorded', () => {
		const [buildings] = creditGroups(ctx({ sources: ['overture'] }));
		expect(buildings.credits).toEqual(['© OpenStreetMap contributors (ODbL) and other sources via Overture Maps Foundation']);
	});

	it('credits unknown sources by name', () => {
		const [buildings] = creditGroups(ctx({ sources: ['overture'], buildingSources: ['City of Bethlehem'] }));
		expect(buildings.credits[0]).toBe('City of Bethlehem');
	});

	it('writes one line with each organization once', () => {
		expect(creditLine(ctx({ sources: ['overture', 'pasda-lehigh'], buildingSources: ['OpenStreetMap', 'Microsoft ML Buildings'] }))).toBe(
			'Data: OpenStreetMap contributors, Microsoft, Overture Maps Foundation, TomTom, Lehigh County via PASDA',
		);
	});
});
