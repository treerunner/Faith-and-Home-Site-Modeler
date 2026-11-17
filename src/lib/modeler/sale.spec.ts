import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { storedSite } from './existing';
import { normalizeSite } from './serialize';
import {
	buildingType,
	dwellingsEstimate,
	grossFloorArea,
	inferDevelopmentType,
	keptPlan,
	lotCoverage,
	openSpaceArea,
	parkingArea,
	saleArea,
	soldStructures,
} from './metrics';

type Pt = [number, number];
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// A church at the origin and a hall at x = 40 on a 100 × 60 m parcel; then a plan
function siteWithHall() {
	store.site.parcel = box(-20, -30, 80, 30);
	store.placePart('square', 0, 0);
	const church = store.plan.structures.at(-1)!.id;
	store.updateStructure(church, { label: 'Church', uses: ['worship'] });
	store.placePart('square', 40, 0);
	const hall = store.plan.structures.at(-1)!.id;
	store.updateStructure(hall, { label: 'Hall', uses: ['housing'], dwellings: 4 });
	store.newPlan();
	return { church, hall };
}

const sellEast = () => store.addOpenSpace('sale', box(30, -30, 80, 30));

describe('land to sell', () => {
	beforeEach(() => store.newSite());

	it('a building whose center is on the land to sell goes with it; one off it stays', () => {
		const { church, hall } = siteWithHall();
		sellEast();
		const sold = soldStructures(store.plan);
		expect(sold.has(hall)).toBe(true);
		expect(sold.has(church)).toBe(false);
		expect(keptPlan(store.plan).structures.map((s) => s.id)).toEqual([church]);
	});

	it('a rooftop piece goes with its host', () => {
		const { hall } = siteWithHall();
		store.placePart('square', 40, 0); // lands on the hall's roof
		const rider = store.plan.structures.at(-1)!;
		expect(rider.onRoofOf).toBe(hall);
		sellEast();
		expect(soldStructures(store.plan).has(rider.id)).toBe(true);
	});

	it('what the congregation keeps is measured: floor area, units, open space', () => {
		siteWithHall();
		const before = { gfa: grossFloorArea(store.plan), units: dwellingsEstimate(store.plan) };
		store.addOpenSpace('parking', box(50, 10, 70, 25)); // a lot on the land sold
		store.addOpenSpace('lawn', box(-15, 10, 0, 25));
		sellEast();
		const kept = keptPlan(store.plan);
		expect(grossFloorArea(kept)).toBeLessThan(before.gfa);
		expect(dwellingsEstimate(kept)).toBe(before.units - 4);
		expect(parkingArea(kept)).toBe(0);
		// Land to sell isn't open space
		expect(openSpaceArea(store.plan)).toBeCloseTo(300 + 225);
		expect(openSpaceArea(kept)).toBeCloseTo(225);
		expect(saleArea(store.plan)).toBeCloseTo(50 * 60);
	});

	it('lot coverage is on the land kept', () => {
		siteWithHall();
		const before = lotCoverage(store.plan, store.site)!;
		sellEast();
		const fp = 36; // the 6 m church
		expect(lotCoverage(store.plan, store.site)).toBeCloseTo((fp / (100 * 60 - 50 * 60)) * 100);
		expect(before).toBeCloseTo((72 / 6000) * 100);
	});

	it('selling with nothing else proposed is Downsize / sell; adding a building makes it New development', () => {
		siteWithHall();
		expect(inferDevelopmentType(store.plan)).toBe('existing');
		sellEast();
		expect(inferDevelopmentType(store.plan)).toBe('downsize_sell');
		store.placePart('square', -10, 20);
		expect(inferDevelopmentType(store.plan)).toBe('new');
		// A new building on the land sold doesn't count as the congregation's
		store.undo();
		store.placePart('square', 60, 20);
		expect(inferDevelopmentType(store.plan)).toBe('downsize_sell');
	});

	it('the building type reads the buildings kept', () => {
		siteWithHall();
		store.placePart('square', 0, 20); // a third building near the church: a cluster with the hall
		expect(buildingType(store.plan)).toBe('cluster');
		sellEast();
		expect(buildingType(store.plan)).not.toBe('cluster');
	});

	it('is a plan\'s proposal: not drawn on the site view, and dropped from existing conditions on load', () => {
		siteWithHall();
		store.switchPlan(store.site.existing.id);
		store.startDrawingOpenSpace('sale');
		expect(store.mode.type).toBe('idle');
		const stored = storedSite(store.site);
		stored.existing.openSpaces.push({ id: 'x', kind: 'sale', polygon: box(0, 0, 5, 5) });
		const loaded = normalizeSite(JSON.parse(JSON.stringify(stored)));
		expect(loaded.existing.openSpaces.some((os) => os.kind === 'sale')).toBe(false);
	});

	it('a plan\'s land to sell survives a save and reload', () => {
		siteWithHall();
		sellEast();
		const loaded = normalizeSite(JSON.parse(JSON.stringify(storedSite(store.site))));
		expect(loaded.plans[0].openSpaces.filter((os) => os.kind === 'sale')).toHaveLength(1);
	});
});
