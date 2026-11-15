import { describe, it, expect, beforeEach } from 'vitest';
import { store } from './store.svelte';
import { asPoly, outlinePart, partOutline, snapPoint, withOutline, zoneOutline } from './geo';
import { partFootprint, polygonArea } from './metrics';
import type { Part } from './types';

type Pt = [number, number];
const L: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
const close = (a: Pt[], b: Pt[]) => a.forEach((p, i) => { expect(p[0]).toBeCloseTo(b[i][0], 6); expect(p[1]).toBeCloseTo(b[i][1], 6); });

describe('outline geometry', () => {
	it('keeps a drawn outline exactly, as points', () => {
		expect(outlinePart([[0, 0], [8, 0], [8, 5], [0, 5]]).shape).toBe('poly');
		const l = { id: 'l', ...outlinePart(L) } as Part;
		expect(l.shape).toBe('poly');
		expect(polygonArea(partOutline(l))).toBeCloseTo(64);
		expect(partOutline(l).length).toBe(6);
	});

	it('reshapes a part around new points, keeping its rotation', () => {
		const part: Part = { id: 'p', shape: 'rect', x: 0, y: 0, w: 10, d: 6, rotation: 30 };
		const poly = asPoly(part);
		close(partOutline(poly), partOutline(part));
		const moved = partOutline(poly).map((p, i): Pt => (i === 0 ? [p[0] - 3, p[1]] : p));
		const after = withOutline(poly, moved);
		expect(after.rotation).toBe(30);
		close(partOutline(after), moved);
	});

	it('snaps to corners first, then edges, within the radius', () => {
		const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
		expect(snapPoint([10.4, 0.3], [sq], 1)).toEqual({ point: [10, 0], kind: 'corner' });
		expect(snapPoint([5, 0.4], [sq], 1)).toEqual({ point: [5, 0], kind: 'edge' });
		expect(snapPoint([5, 3], [sq], 1)).toBeNull();
	});
});

describe('drawing and editing outlines in the store', () => {
	beforeEach(() => store.newSite());

	function draw(points: Pt[], radius = 0) {
		store.startDrawingStructure();
		for (const [x, y] of points) store.addStructureVertex(x, y, radius);
		store.addStructureVertex(points[0][0], points[0][1], radius);
	}

	it('draws an L into one structure, new in a plan, on a roof when its center lands on one', () => {
		draw(L);
		expect(store.plan.structures).toHaveLength(1);
		expect(store.plan.structures[0]).toMatchObject({ status: 'existing' });
		expect(store.plan.structures[0].parts[0].shape).toBe('poly');
		store.newPlan();
		draw([[1, 1], [3, 1], [3, 3], [1, 3]]);
		expect(store.plan.structures.at(-1)).toMatchObject({ status: 'new', onRoofOf: store.plan.structures[0].id });
		store.undo();
		expect(store.plan.structures).toHaveLength(1);
	});

	it('snaps drawn points onto a neighbor', () => {
		store.placePart('square', 0, 0); // -3..3
		draw([[3.3, -3.2], [10, -3], [10, 3], [3.2, 2.8]], 1);
		const outline = partOutline(store.plan.structures[1].parts[0]);
		expect(outline.some(([x, y]) => Math.abs(x - 3) < 1e-6 && Math.abs(y + 3) < 1e-6)).toBe(true);
	});

	it('moves, inserts and removes points, each one undo step', () => {
		draw([[0, 0], [10, 0], [10, 10], [0, 10]]);
		const s = store.plan.structures[0];
		store.editPoints(s.id);
		const id = () => store.plan.structures[0].parts[0].id;
		const area = () => partFootprint(store.plan.structures[0].parts[0]);
		store.startDraggingVertex(id(), 2);
		store.updateDragVertex(14, 10);
		store.endDragVertex();
		expect(area()).toBeCloseTo(120);
		store.startDraggingVertex(id(), 0, true); // a new point between 0 and 1
		store.updateDragVertex(5, -4);
		store.endDragVertex();
		expect(partOutline(store.plan.structures[0].parts[0])).toHaveLength(5);
		expect(area()).toBeCloseTo(140);
		store.removeVertex(id(), 1);
		expect(area()).toBeCloseTo(120);
		store.undo();
		expect(area()).toBeCloseTo(140);
		for (let i = 0; i < 3; i++) store.removeVertex(id(), 0);
		expect(partOutline(store.plan.structures[0].parts[0])).toHaveLength(3);
	});

	it('leaves the site\'s pieces alone in a plan, and keeps zones where they are', () => {
		draw([[0, 0], [20, 0], [20, 10], [0, 10]]);
		const s = store.plan.structures[0];
		store.editPoints(s.id);
		store.newPlan();
		const copy = store.plan.structures[0];
		store.addWholeBuildingReuse(copy.id);
		store.startDraggingVertex(copy.parts[0].id, 1);
		expect(store.mode.type).not.toBe('draggingVertex');
		// On the site, a far corner moves; the plan's zone keeps its ground, clipped to the new outline
		const plan = store.plan.id;
		store.switchPlan(store.site.existing.id);
		store.startDraggingVertex(s.parts[0].id, 1);
		store.updateDragVertex(10, 0);
		store.updateDragVertex(30, 0);
		store.updateDragVertex(20, 0);
		store.endDragVertex();
		store.switchPlan(plan);
		const z = store.plan.structures[0].reuseZones![0];
		expect(polygonArea(zoneOutline(z, store.plan.structures[0].parts[0]))).toBeCloseTo(200);
	});
});
