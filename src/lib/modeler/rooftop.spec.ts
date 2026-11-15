import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { roofBase, settleRoofHosts } from './geometry';
import { grossFloorArea, inferBuildingType, inferDevelopmentType, siteFootprint } from './metrics';
import { storedSite } from './existing';
import { normalizeSite } from './serialize';
import type { Structure } from './types';

// A 20 x 10 m, 3-story building on the site view, 3.5 m floors
function placeBuilding(): Structure {
	store.placePart('rect', 0, 0);
	const s = store.plan.structures.at(-1)!;
	s.parts[0].w = 20;
	s.parts[0].d = 10;
	store.updateStructure(s.id, { stories: 3, label: 'Church' });
	return s;
}

const byId = (id: string) => store.plan.structures.find((s) => s.id === id)!;

describe('rooftop pieces', () => {
	beforeEach(() => store.newSite());

	it('sit on the roof of the building their center lands on, and ride its stack', () => {
		const church = placeBuilding();
		store.placePart('circle', 2, 1);
		const drum = store.plan.structures.at(-1)!;
		expect(drum.onRoofOf).toBe(church.id);
		expect(drum.groupId).toBeUndefined();
		expect(roofBase(drum, store.plan.structures)).toBeCloseTo(10.5);
		// A lantern on the drum chains
		store.placePart('square', 2, 1);
		const lantern = store.plan.structures.at(-1)!;
		expect(lantern.onRoofOf).toBe(drum.id);
		expect(roofBase(lantern, store.plan.structures)).toBeCloseTo(14);
		// Off the building, back on the ground
		store.startDragging(drum.parts[0].id, 0, 0);
		store.updateDrag(40, 40);
		store.endDrag();
		expect(byId(drum.id).onRoofOf).toBeUndefined();
	});

	it('move with the building they rest on', () => {
		const church = placeBuilding();
		store.placePart('circle', 2, 1);
		const drum = store.plan.structures.at(-1)!;
		store.startDragging(church.parts[0].id, 0, 0);
		store.updateDrag(10, 0);
		store.endDrag();
		expect(byId(drum.id).parts[0].x).toBeCloseTo(12);
		expect(byId(drum.id).onRoofOf).toBe(church.id);
	});

	it('take no ground, and don\'t change the building type', () => {
		placeBuilding();
		const ground = siteFootprint(store.plan);
		const gfa = grossFloorArea(store.plan);
		store.placePart('circle', 2, 1);
		expect(siteFootprint(store.plan)).toBeCloseTo(ground);
		expect(grossFloorArea(store.plan)).toBeGreaterThan(gfa);
		expect(inferBuildingType(store.plan)).toBe('box');
	});

	it('in a plan: new on a site roof, and the site\'s go when their host goes', () => {
		const church = placeBuilding();
		store.placePart('circle', 2, 1);
		const drum = store.plan.structures.at(-1)!;
		store.newPlan();
		store.updateStructure(drum.id, { onRoofOf: undefined }); // the site's, locked
		expect(byId(drum.id).onRoofOf).toBe(church.id);
		store.placePart('square', -6, 0);
		const flat = store.plan.structures.at(-1)!;
		expect(flat).toMatchObject({ status: 'new', onRoofOf: church.id });
		expect(inferDevelopmentType(store.plan)).toBe('new');
		store.updateStructure(church.id, { status: 'removed' });
		expect(byId(drum.id).status).toBe('removed');
		store.updateStructure(church.id, { status: 'existing' });
		expect(byId(drum.id).status).toBe('existing');
	});

	it('keep their host through saving, and come down when it\'s gone', () => {
		const church = placeBuilding();
		store.placePart('circle', 2, 1);
		const loaded = normalizeSite(JSON.parse(JSON.stringify(storedSite(JSON.parse(JSON.stringify(store.site))))));
		expect(loaded.existing.structures[1].onRoofOf).toBe(church.id);
		const lone = settleRoofHosts([{ ...loaded.existing.structures[1], onRoofOf: 'gone' }]);
		expect(lone[0].onRoofOf).toBeUndefined();
		store.deleteStructure(church.id);
		expect(store.plan.structures[0].onRoofOf).toBeUndefined();
	});
});
