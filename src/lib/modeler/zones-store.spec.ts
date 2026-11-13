import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { zoneOutline } from './geo';
import { polygonArea } from './metrics';

// A 20 x 10 m, 3-story existing building centered on the origin
function placeBuilding() {
	store.placePart('rect', 0, 0);
	const s = store.plan.structures.at(-1)!;
	s.parts[0].w = 20;
	s.parts[0].d = 10;
	store.updateStructure(s.id, { stories: 3, uses: ['worship'] });
	return s;
}

const zonesOf = (id: string) => store.plan.structures.find((s) => s.id === id)?.reuseZones ?? [];

function draw(points: [number, number][]) {
	for (const [x, y] of points) store.addZoneVertex(x, y);
	store.addZoneVertex(points[0][0], points[0][1]); // close
}

describe('reuse zones in the store', () => {
	beforeEach(() => store.newSite());

	it('reuses a whole building on all floors, as housing', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		expect(zonesOf(s.id)).toHaveLength(1);
		expect(zonesOf(s.id)[0]).toMatchObject({ floors: [1, 3], use: 'housing' });
		expect(polygonArea(zoneOutline(zonesOf(s.id)[0], s.parts[0]))).toBeCloseTo(200);
	});

	it('draws a zone clipped to the building', () => {
		const s = placeBuilding();
		store.startDrawingZone(s.id);
		draw([[-15, -10], [0, -10], [0, 10], [-15, 10]]); // the west half, overhanging north and south
		expect(store.mode.type).toBe('selected');
		const [z] = zonesOf(s.id);
		expect(polygonArea(zoneOutline(z, s.parts[0]))).toBeCloseTo(100);
	});

	it('reports an outline that misses the building', () => {
		const s = placeBuilding();
		store.startDrawingZone(s.id);
		draw([[40, 40], [50, 40], [50, 50]]);
		expect(store.mode).toMatchObject({ type: 'drawingZone', missed: true });
		expect(zonesOf(s.id)).toHaveLength(0);
	});

	it('keeps floors within the building', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		const z = zonesOf(s.id)[0];
		store.updateZone(z.id, { floors: [0, 9] });
		expect(zonesOf(s.id)[0].floors).toEqual([1, 3]); // no basement, 3 stories
		store.updateStructure(s.id, { basement: true });
		store.updateZone(z.id, { floors: [0, 1] });
		expect(zonesOf(s.id)[0].floors).toEqual([0, 1]);
		store.updateStructure(s.id, { stories: 2 });
		store.updateZone(z.id, { floors: [2, 3] });
		expect(zonesOf(s.id)[0].floors).toEqual([2, 2]);
	});

	it('drops zones when the building is no longer existing', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		store.updateStructure(s.id, { status: 'removed' });
		expect(zonesOf(s.id)).toHaveLength(0);
	});

	it('clears units when a zone stops being housing', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		const z = zonesOf(s.id)[0];
		store.updateZone(z.id, { dwellings: 6 });
		store.updateZone(z.id, { use: 'community' });
		expect(zonesOf(s.id)[0].dwellings).toBeUndefined();
	});

	it('moves zones to the pieces when the building is cut', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		store.cutStructure(s.id, [5, -20], [5, 20]); // 15 m and 5 m pieces
		const [original, piece] = store.plan.structures;
		const area = (st: typeof original) => st.reuseZones!.reduce((sum, z) => sum + polygonArea(zoneOutline(z, st.parts.find((p) => p.id === z.partId)!)), 0);
		expect(area(original)).toBeCloseTo(150);
		expect(area(piece)).toBeCloseTo(50);
		expect(piece.reuseZones![0].partId).toBe(piece.parts[0].id);
	});

	it('gives a cloned building its own zones on its own parts', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		store.duplicateStructure(s.parts[0].id);
		const clone = store.plan.structures.at(-1)!;
		expect(clone.reuseZones![0].partId).toBe(clone.parts[0].id);
		expect(clone.reuseZones![0].id).not.toBe(zonesOf(s.id)[0].id);
	});

	it('starts a New plan with nothing reused', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		store.newPlan();
		expect(store.plan.structures[0].reuseZones).toBeUndefined();
	});

	it('undoes adding and deleting zones', () => {
		const s = placeBuilding();
		store.addWholeBuildingReuse(s.id);
		store.deleteZone(zonesOf(s.id)[0].id);
		expect(zonesOf(s.id)).toHaveLength(0);
		store.undo();
		expect(zonesOf(s.id)).toHaveLength(1);
		store.undo();
		expect(zonesOf(s.id)).toHaveLength(0);
	});
});
