import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { toLocal } from './geo';
import { centeredBoardHalf, parcelCenter, recenterOffset, reloadedBuildings, shiftSite } from './recenter';

type Pt = [number, number];
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe('recenterOffset', () => {
	it('leaves a parcel about centered on the address alone', () => {
		expect(recenterOffset(undefined)).toBeNull();
		expect(recenterOffset(box(-20, -20, 25, 20))).toBeNull();
		expect(recenterOffset(box(0, -30, 70, 30))).toBeNull(); // 35 m off: within reach
	});

	it("moves to the middle of a parcel well off it, like a campus whose address is at the street", () => {
		// First Presbyterian, Bethlehem: the address is at the lot's west edge, the church 210 m east
		const campus = box(-10, -200, 330, 130);
		expect(parcelCenter(campus)).toEqual([160, -35]);
		expect(recenterOffset(campus)).toEqual([160, -35]);
	});
});

describe('shiftSite', () => {
	beforeEach(() => store.newSite());

	it('moves the origin and every position by the same amount, so nothing moves on the ground', () => {
		const origin = { lat: 40.6448, lng: -75.3763 };
		store.site.mode = 'address';
		store.site.origin = origin;
		store.site.parcel = box(100, -50, 200, 50);
		store.site.context = { buildings: [{ polygon: box(140, -10, 160, 10), height: 9 }], roads: [{ line: [[0, -100], [0, 100]], kind: 'tertiary' }], halfSize: 250, terrain: { spacing: 5, heights: [0] } };
		store.placePart('square', 150, 0);
		store.placeTree(120, 20);
		store.addNote(130, -20);
		store.addOpenSpace('lawn', box(110, 20, 130, 40));
		store.newPlan();
		store.placePart('square', 180, 0);

		const d: Pt = [150, 0];
		const site = shiftSite(store.site, d);
		// The church's spot on the ground is now the origin
		const church = toLocal(origin.lat, origin.lng + 150 / (111320 * Math.cos((origin.lat * Math.PI) / 180)), origin);
		expect(church[0]).toBeCloseTo(150, 0);
		const back = toLocal(origin.lat, origin.lng, site.origin!);
		expect(back[0]).toBeCloseTo(-150, 1);
		expect(back[1]).toBeCloseTo(0, 1);

		expect(site.parcel).toEqual(box(-50, -50, 50, 50));
		expect(site.context.buildings[0].polygon).toEqual(box(-10, -10, 10, 10));
		expect(site.context.roads[0].line).toEqual([[-150, -100], [-150, 100]]);
		expect(site.context.halfSize).toBe(250);
		expect(site.context.terrain).toBeUndefined(); // reloaded around the new origin
		expect(site.existing.structures[0].parts[0]).toMatchObject({ x: 0, y: 0 });
		expect(site.existing.trees[0]).toMatchObject({ x: -30, y: 20 });
		expect(site.existing.annotations[0]).toMatchObject({ x: -20, y: -20 });
		expect(site.existing.openSpaces[0].polygon).toEqual(box(-40, 20, -20, 40));
		expect(site.plans[0].structures.map((s) => s.parts[0].x).sort((a, b) => a - b)).toEqual([0, 30]);
	});
});

describe('board size after recentering', () => {
	it('is what the centered parcel needs', () => {
		expect(centeredBoardHalf(box(-40, -30, 40, 30))).toBe(150);
		expect(centeredBoardHalf(box(-170, -165, 170, 165))).toBe(400);
	});
});

describe('reloadedBuildings', () => {
	const sq = (x: number, y: number, id: string) => ({ id, polygon: box(x - 5, y - 5, x + 5, y + 5) });

	it("keeps the old board as it was and adds only the new ring's buildings", () => {
		// The church at the origin became chipboard and left the old foam
		const old = [sq(100, 0, 'neighbor')];
		const fetched = [sq(0, 0, 'church again'), sq(100, 0, 'neighbor again'), sq(200, 0, 'new ring'), sq(149, 0, 'edge again')];
		expect(reloadedBuildings(old, 150, [0, 0], 250, fetched).map((b) => b.id)).toEqual(['neighbor', 'new ring']);
	});

	it('on a moved board, drops old buildings past its edge and adds the fetched ones off the old board', () => {
		// The old board was centered 160 m west of the new origin
		const old = [sq(-300, 0, 'far west'), sq(-100, 0, 'neighbor')];
		const fetched = [sq(-100, 0, 'neighbor again'), sq(0, 0, 'church'), sq(100, 0, 'east')];
		expect(reloadedBuildings(old, 150, [-160, 0], 150, fetched).map((b) => b.id)).toEqual(['neighbor', 'church', 'east']);
	});
});

describe('setting a parcel well off the address', () => {
	beforeEach(() => store.newSite());

	it('centers the board on it, and undo puts it back', () => {
		const origin = { lat: 40.6448, lng: -75.3763 };
		store.site.mode = 'address';
		store.site.origin = origin;
		store.site.context = { buildings: [], roads: [] };
		store.startDrawingParcel();
		for (const [x, y] of [[-10, -200], [330, -200], [330, 130], [-10, 130], [-10, -200]] as Pt[]) store.addParcelVertex(x, y);
		expect(store.site.parcel).toEqual(box(-170, -165, 170, 165));
		expect(store.site.origin).not.toEqual(origin);
		expect(store.canCenterBoard).toBe(false);
		store.undo();
		expect(store.site.origin).toEqual(origin);
		expect(store.site.parcel).toBeUndefined();
	});
});

describe("adding the parcel's buildings after the board moved", () => {
	beforeEach(() => store.newSite());

	it('takes their foam away, though the moved foam is off by a hair', () => {
		store.site.mode = 'address';
		store.site.origin = { lat: 40.6448, lng: -75.3763 };
		const church = box(-20, -15, 20, 15);
		const moved = church.map(([x, y]): Pt => [x + 3e-9, y - 2e-9]); // shifted by arithmetic, not refetched
		store.site.context = { buildings: [{ polygon: moved, height: 12 }, { polygon: box(60, 0, 70, 10), height: 6 }], roads: [] };
		const fetched = { id: 'church', polygon: church, height: 12, tags: { building: 'church' }, name: 'First Church' };
		store.setup = { context: { buildings: [fetched], roads: [], parcels: [], sources: [], buildingSources: [], parcelsFailed: false }, selected: [], prefill: [fetched] };
		store.prefillBuildings();
		expect(store.site.existing.structures.map((s) => s.label)).toEqual(['First Church']);
		expect(store.site.context.buildings).toHaveLength(1); // the neighbor stays foam
	});
});
