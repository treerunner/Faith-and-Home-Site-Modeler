import { describe, it, expect } from 'vitest';
import { partFootprint, structureFootprint, siteFootprint, grossFloorArea } from './metrics';
import type { Part, Site, Structure } from './types';

function makePart(overrides: Partial<Part> = {}): Part {
	return {
		id: 'p1',
		shape: 'rect',
		x: 0,
		y: 0,
		w: 10,
		d: 6,
		rotation: 0,
		...overrides,
	};
}

function makeStructure(overrides: Partial<Structure> = {}): Structure {
	return {
		id: 's1',
		label: 'Sanctuary',
		status: 'existing',
		uses: ['worship'],
		stories: 1,
		floorHeight: 3.5,
		roof: 'flat',
		parts: [makePart()],
		provenance: 'user',
		...overrides,
	};
}

function makeSite(overrides: Partial<Site> = {}): Site {
	return {
		id: 'site1',
		name: 'Test',
		mode: 'grid',
		structures: [makeStructure()],
		openSpaces: [],
		context: { footprints: [], roads: [] },
		annotations: [],
		...overrides,
	};
}

describe('partFootprint', () => {
	it('returns w × d', () => {
		expect(partFootprint(makePart({ w: 10, d: 6 }))).toBe(60);
		expect(partFootprint(makePart({ w: 5, d: 5 }))).toBe(25);
	});
});

describe('structureFootprint', () => {
	it('sums part footprints', () => {
		const s = makeStructure({
			parts: [makePart({ w: 10, d: 6 }), makePart({ id: 'p2', w: 4, d: 4 })],
		});
		expect(structureFootprint(s)).toBe(76);
	});

	it('returns 0 for empty structure', () => {
		expect(structureFootprint(makeStructure({ parts: [] }))).toBe(0);
	});
});

describe('siteFootprint', () => {
	it('sums across all structures', () => {
		const site = makeSite({
			structures: [
				makeStructure({ id: 's1', parts: [makePart({ w: 10, d: 6 })] }), // 60
				makeStructure({ id: 's2', parts: [makePart({ id: 'p2', w: 8, d: 4 })] }), // 32
			],
		});
		expect(siteFootprint(site)).toBe(92);
	});
});

describe('grossFloorArea', () => {
	it('multiplies footprint by stories', () => {
		const site = makeSite({
			structures: [makeStructure({ stories: 3, parts: [makePart({ w: 10, d: 6 })] })],
		});
		expect(grossFloorArea(site)).toBe(180);
	});

	it('sums across structures with different story counts', () => {
		const site = makeSite({
			structures: [
				makeStructure({ id: 's1', stories: 2, parts: [makePart({ w: 10, d: 6 })] }), // 120
				makeStructure({ id: 's2', stories: 1, parts: [makePart({ id: 'p2', w: 5, d: 4 })] }), // 20
			],
		});
		expect(grossFloorArea(site)).toBe(140);
	});
});
