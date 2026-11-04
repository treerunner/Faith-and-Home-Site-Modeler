import type { OpenSpace, Part, Site, Structure } from './types';
import type { InteractionMode, ResizeHandle } from './interaction';
import { getPartAABB, snapEdge, snapToGrid, type AABB } from './snap';

const PART_DEFAULTS: Record<Part['shape'], { w: number; d: number }> = {
	rect: { w: 10, d: 6 },
	square: { w: 6, d: 6 },
	tri: { w: 6, d: 6 },
};

const MAX_UNDO = 50;

function makeSite(): Site {
	return {
		id: crypto.randomUUID(),
		name: 'Untitled Site',
		mode: 'grid',
		structures: [],
		openSpaces: [],
		context: { footprints: [], roads: [] },
		annotations: [],
	};
}

class ModelerStore {
	site = $state<Site>(makeSite());
	mode = $state<InteractionMode>({ type: 'idle' });
	activeStructureId = $state<string>('');
	viewMode = $state<'plan' | '3d'>('plan');

	readonly #undoStack: Site[] = [];
	readonly #redoStack: Site[] = [];
	#gestureDidMutate = false;

	constructor() {
		this.activeStructureId = '';
	}

	get selectedPartId(): string | null {
		const m = this.mode;
		if (
			m.type === 'selected' ||
			m.type === 'dragging' ||
			m.type === 'resizing' ||
			m.type === 'rotating'
		) {
			return m.partId;
		}
		return null;
	}

	get allParts(): Part[] {
		return this.site.structures.flatMap((s) => s.parts);
	}

	get selectedPart(): Part | undefined {
		const id = this.selectedPartId;
		return id ? this.allParts.find((p) => p.id === id) : undefined;
	}

	get selectedStructure(): Structure | undefined {
		const id = this.selectedPartId;
		if (!id) return undefined;
		return this.site.structures.find((s) => s.parts.some((p) => p.id === id));
	}

	get activeStructure(): Structure | undefined {
		return this.site.structures.find((s) => s.id === this.activeStructureId);
	}

	get selectedOpenSpaceId(): string | null {
		const m = this.mode;
		if (
			m.type === 'selectedOpenSpace' ||
			m.type === 'draggingOpenSpace' ||
			m.type === 'draggingOsVertex'
		) {
			return m.openSpaceId;
		}
		return null;
	}

	get selectedOpenSpace(): OpenSpace | undefined {
		const id = this.selectedOpenSpaceId;
		return id ? this.site.openSpaces.find((o) => o.id === id) : undefined;
	}

	#pushUndo() {
		const snapshot = $state.snapshot(this.site) as Site;
		if (this.#undoStack.length >= MAX_UNDO) this.#undoStack.shift();
		this.#undoStack.push(snapshot);
		this.#redoStack.splice(0);
	}

	#mutPart(id: string, fn: (p: Part) => void) {
		for (const s of this.site.structures) {
			const p = s.parts.find((p) => p.id === id);
			if (p) {
				fn(p);
				return;
			}
		}
	}

	#findPart(id: string): Part | undefined {
		return this.allParts.find((p) => p.id === id);
	}

	// Clone the structure that owns partId, return the corresponding new part's id.
	// No #pushUndo() here — startDragging captures the state including the clone.
	duplicateStructure(partId: string): string | null {
		const srcStructure = this.site.structures.find((s) => s.parts.some((p) => p.id === partId));
		if (!srcStructure) return null;
		const snapshot = $state.snapshot(srcStructure) as Structure;
		const partIndex = snapshot.parts.findIndex((p) => p.id === partId);
		const newParts = snapshot.parts.map((p) => ({ ...p, id: crypto.randomUUID() }));
		const newStructure: Structure = {
			...snapshot,
			id: crypto.randomUUID(),
			parts: newParts,
		};
		this.site.structures.push(newStructure);
		this.activeStructureId = newStructure.id;
		return newParts[partIndex >= 0 ? partIndex : 0].id;
	}

	splitStructure(id: string) {
		this.#pushUndo();
		const structure = this.site.structures.find((s) => s.id === id);
		if (!structure || structure.parts.length <= 1) return;
		const snap = $state.snapshot(structure) as Structure;
		structure.parts = [snap.parts[0]];
		for (const part of snap.parts.slice(1)) {
			this.site.structures.push({ ...snap, id: crypto.randomUUID(), parts: [part] });
		}
	}

	placePart(shape: Part['shape'], x: number, y: number) {
		this.#pushUndo();
		const part: Part = {
			id: crypto.randomUUID(),
			shape,
			x: snapToGrid(x),
			y: snapToGrid(y),
			...PART_DEFAULTS[shape],
			rotation: 0,
		};
		// Each placed shape gets its own structure entry
		const s: Structure = {
			id: crypto.randomUUID(),
			label: 'Structure',
			status: 'existing',
			uses: [],
			stories: 1,
			floorHeight: 3.5,
			roof: 'flat',
			parts: [part],
			provenance: 'user',
		};
		this.site.structures.push(s);
		this.activeStructureId = s.id;
		this.mode = { type: 'selected', partId: part.id };
	}

	addStructure() {
		this.#pushUndo();
		const s: Structure = {
			id: crypto.randomUUID(),
			label: 'Structure',
			status: 'existing',
			uses: [],
			stories: 1,
			floorHeight: 3.5,
			roof: 'flat',
			parts: [],
			provenance: 'user',
		};
		this.site.structures.push(s);
		this.activeStructureId = s.id;
	}

	setActiveStructure(id: string) {
		this.activeStructureId = id;
	}

	selectStructure(id: string) {
		this.activeStructureId = id;
		const s = this.site.structures.find((s) => s.id === id);
		if (s && s.parts.length > 0) {
			this.mode = { type: 'selected', partId: s.parts[0].id };
		} else {
			this.mode = { type: 'idle' };
		}
	}

	updateStructure(
		id: string,
		patch: Partial<
			Pick<Structure, 'label' | 'status' | 'uses' | 'stories' | 'floorHeight' | 'roof'>
		>,
	) {
		this.#pushUndo();
		const s = this.site.structures.find((s) => s.id === id);
		if (!s) return;
		Object.assign(s, patch);
	}

	deleteStructure(id: string) {
		this.#pushUndo();
		const idx = this.site.structures.findIndex((s) => s.id === id);
		if (idx === -1) return;
		this.site.structures.splice(idx, 1); // parts are deleted with the structure
		if (this.activeStructureId === id) {
			this.activeStructureId = this.site.structures[0]?.id ?? '';
		}
		this.mode = { type: 'idle' };
	}

	selectOpenSpace(id: string | null) {
		this.mode = id ? { type: 'selectedOpenSpace', openSpaceId: id } : { type: 'idle' };
	}

	updateOpenSpace(id: string, patch: Partial<Pick<OpenSpace, 'label' | 'kind'>>) {
		this.#pushUndo();
		const os = this.site.openSpaces.find((o) => o.id === id);
		if (!os) return;
		Object.assign(os, patch);
	}

	startDraggingOpenSpace(id: string, anchorX: number, anchorY: number) {
		const os = this.site.openSpaces.find((o) => o.id === id);
		if (!os) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		this.mode = {
			type: 'draggingOpenSpace',
			openSpaceId: id,
			origPolygon: os.polygon.map((p) => [p[0], p[1]] as [number, number]),
			anchorX,
			anchorY,
		};
	}

	updateDragOpenSpace(x: number, y: number) {
		if (this.mode.type !== 'draggingOpenSpace') return;
		const { openSpaceId, origPolygon, anchorX, anchorY } = this.mode;
		const dx = x - anchorX;
		const dy = y - anchorY;
		const os = this.site.openSpaces.find((o) => o.id === openSpaceId);
		if (!os) return;
		os.polygon = origPolygon.map((p) => [p[0] + dx, p[1] + dy]);
		this.#gestureDidMutate = true;
	}

	endDragOpenSpace() {
		if (this.mode.type !== 'draggingOpenSpace') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selectedOpenSpace', openSpaceId: this.mode.openSpaceId };
	}

	startDraggingOsVertex(id: string, vertexIndex: number) {
		const os = this.site.openSpaces.find((o) => o.id === id);
		if (!os) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		this.mode = {
			type: 'draggingOsVertex',
			openSpaceId: id,
			vertexIndex,
			origPolygon: os.polygon.map((p) => [p[0], p[1]] as [number, number]),
		};
	}

	updateDragOsVertex(x: number, y: number) {
		if (this.mode.type !== 'draggingOsVertex') return;
		const { openSpaceId, vertexIndex, origPolygon } = this.mode;
		const os = this.site.openSpaces.find((o) => o.id === openSpaceId);
		if (!os) return;
		os.polygon = origPolygon.map((p, i) =>
			i === vertexIndex ? ([x, y] as [number, number]) : ([p[0], p[1]] as [number, number]),
		);
		this.#gestureDidMutate = true;
	}

	endDragOsVertex() {
		if (this.mode.type !== 'draggingOsVertex') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selectedOpenSpace', openSpaceId: this.mode.openSpaceId };
	}

	startDrawingOpenSpace(kind: OpenSpace['kind']) {
		this.mode = { type: 'drawingOpenSpace', kind, points: [] };
	}

	addOpenSpaceVertex(x: number, y: number): boolean {
		if (this.mode.type !== 'drawingOpenSpace') return false;
		const { kind, points } = this.mode;
		const CLOSE_DIST = 2;
		if (
			points.length >= 3 &&
			Math.hypot(x - points[0][0], y - points[0][1]) < CLOSE_DIST
		) {
			this.addOpenSpace(kind, points);
			return true;
		}
		this.mode = { type: 'drawingOpenSpace', kind, points: [...points, [x, y]], cursorPoint: [x, y] };
		return false;
	}

	updateOpenSpaceCursor(x: number, y: number) {
		if (this.mode.type !== 'drawingOpenSpace') return;
		this.mode = { ...this.mode, cursorPoint: [x, y] };
	}

	addOpenSpace(kind: OpenSpace['kind'], points: [number, number][]) {
		this.#pushUndo();
		const os: OpenSpace = {
			id: crypto.randomUUID(),
			kind,
			polygon: points,
		};
		this.site.openSpaces.push(os);
		this.mode = { type: 'idle' };
	}

	deleteOpenSpace(id: string) {
		this.#pushUndo();
		const idx = this.site.openSpaces.findIndex((o) => o.id === id);
		if (idx !== -1) this.site.openSpaces.splice(idx, 1);
	}

	selectPart(id: string | null) {
		this.mode = id ? { type: 'selected', partId: id } : { type: 'idle' };
	}

	startDragging(id: string, offsetX: number, offsetY: number, cloning = false) {
		this.#pushUndo();
		this.#gestureDidMutate = false;
		const structure = this.site.structures.find((s) => s.parts.some((p) => p.id === id));
		const companions = structure
			? structure.parts.map((p) => ({ id: p.id, initialX: p.x, initialY: p.y }))
			: [{ id, initialX: this.#findPart(id)?.x ?? 0, initialY: this.#findPart(id)?.y ?? 0 }];
		this.mode = { type: 'dragging', partId: id, offsetX, offsetY, companions, cloning };
	}

	updateDrag(worldX: number, worldY: number) {
		if (this.mode.type !== 'dragging') return;
		const { partId, offsetX, offsetY, companions } = this.mode;
		const rawX = worldX - offsetX;
		const rawY = worldY - offsetY;
		const primary = this.#findPart(partId);
		if (!primary) return;
		const gridX = snapToGrid(rawX);
		const gridY = snapToGrid(rawY);
		// Exclude all parts of the dragged structure from snap targets
		const companionIds = new Set(companions.map((c) => c.id));
		const others = this.allParts.filter((p) => !companionIds.has(p.id));
		const snapped = snapEdge({ ...primary, x: gridX, y: gridY }, others);
		// Apply snap delta (edge-snap adjustment) to all companions
		const sdX = snapped.x - gridX;
		const sdY = snapped.y - gridY;
		this.#mutPart(partId, (p) => {
			p.x = snapped.x;
			p.y = snapped.y;
		});
		const primaryInit = companions.find((c) => c.id === partId)!;
		for (const comp of companions) {
			if (comp.id === partId) continue;
			const diffX = comp.initialX - primaryInit.initialX;
			const diffY = comp.initialY - primaryInit.initialY;
			this.#mutPart(comp.id, (p) => {
				p.x = snapToGrid(rawX + diffX) + sdX;
				p.y = snapToGrid(rawY + diffY) + sdY;
			});
		}
		this.#gestureDidMutate = true;
	}

	endDrag() {
		if (this.mode.type !== 'dragging') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		const { partId, cloning } = this.mode;
		// Auto-merge when dropped touching another structure (not while cloning)
		if (!cloning) {
			const draggedStructure = this.site.structures.find((s) =>
				s.parts.some((p) => p.id === partId),
			);
			if (draggedStructure) {
				const target = this.#findTouchingStructure(draggedStructure);
				if (target) this.#mergeStructures(draggedStructure.id, target.id);
			}
		}
		this.mode = { type: 'selected', partId };
	}

	#aabbsTouch(a: AABB, b: AABB): boolean {
		const e = 0.01;
		return (
			a.maxX + e >= b.minX &&
			a.minX - e <= b.maxX &&
			a.maxY + e >= b.minY &&
			a.minY - e <= b.maxY
		);
	}

	#findTouchingStructure(draggedStructure: Structure): Structure | undefined {
		const draggedAABBs = draggedStructure.parts.map((p) => getPartAABB(p));
		for (const other of this.site.structures) {
			if (other.id === draggedStructure.id) continue;
			for (const otherPart of other.parts) {
				const otherAABB = getPartAABB(otherPart);
				for (const draggedAABB of draggedAABBs) {
					if (this.#aabbsTouch(draggedAABB, otherAABB)) return other;
				}
			}
		}
		return undefined;
	}

	#mergeStructures(draggedId: string, targetId: string) {
		const dragged = this.site.structures.find((s) => s.id === draggedId);
		const target = this.site.structures.find((s) => s.id === targetId);
		if (!dragged || !target) return;
		target.parts.push(...dragged.parts);
		this.site.structures.splice(this.site.structures.indexOf(dragged), 1);
		if (this.activeStructureId === draggedId) this.activeStructureId = targetId;
	}

	startResizing(id: string, handle: ResizeHandle) {
		const part = this.#findPart(id);
		if (!part) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		const hw = part.w / 2;
		const hd = part.d / 2;
		// anchor = corner opposite to the handle being dragged
		const anchorX = part.x + (handle.includes('e') ? -hw : hw);
		const anchorY = part.y + (handle.includes('n') ? -hd : hd);
		this.mode = { type: 'resizing', partId: id, handle, anchorX, anchorY };
	}

	updateResize(worldX: number, worldY: number) {
		if (this.mode.type !== 'resizing') return;
		const { partId, anchorX, anchorY } = this.mode;
		const newW = Math.max(1, snapToGrid(Math.abs(worldX - anchorX), 0.5));
		const newD = Math.max(1, snapToGrid(Math.abs(worldY - anchorY), 0.5));
		const newX = (worldX + anchorX) / 2;
		const newY = (worldY + anchorY) / 2;
		this.#mutPart(partId, (p) => {
			p.w = newW;
			p.d = newD;
			p.x = newX;
			p.y = newY;
		});
		this.#gestureDidMutate = true;
	}

	endResize() {
		if (this.mode.type !== 'resizing') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	startRotating(id: string, mouseX: number, mouseY: number) {
		const part = this.#findPart(id);
		if (!part) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		const startAngle = Math.atan2(mouseY - part.y, mouseX - part.x) * (180 / Math.PI);
		this.mode = {
			type: 'rotating',
			partId: id,
			centerX: part.x,
			centerY: part.y,
			startAngle,
			startRotation: part.rotation,
		};
	}

	updateRotation(mouseX: number, mouseY: number, free: boolean) {
		if (this.mode.type !== 'rotating') return;
		const { partId, centerX, centerY, startAngle, startRotation } = this.mode;
		const angle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
		let delta = angle - startAngle;
		if (!free) delta = Math.round(delta / 15) * 15;
		this.#mutPart(partId, (p) => {
			p.rotation = ((startRotation + delta) % 360 + 360) % 360;
		});
		this.#gestureDidMutate = true;
	}

	endRotation() {
		if (this.mode.type !== 'rotating') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	rotatePart(id: string, delta: number) {
		this.#pushUndo();
		this.#mutPart(id, (p) => {
			p.rotation = ((p.rotation + delta) % 360 + 360) % 360;
		});
	}

	deletePart(id: string) {
		// Delete the entire structure that owns this part (1 part = 1 structure)
		const owner = this.site.structures.find((s) => s.parts.some((p) => p.id === id));
		if (owner) {
			this.#pushUndo();
			const wasActive = this.activeStructureId === owner.id;
			this.site.structures.splice(this.site.structures.indexOf(owner), 1);
			if (wasActive) this.activeStructureId = this.site.structures[0]?.id ?? '';
		}
		this.mode = { type: 'idle' };
	}

	updateGhostPos(shape: Part['shape'], ghostX: number, ghostY: number) {
		this.mode = { type: 'placing', shape, ghostX, ghostY };
	}

	cancelPlacing() {
		this.mode = { type: 'idle' };
	}

	toggleViewMode() {
		this.viewMode = this.viewMode === 'plan' ? '3d' : 'plan';
	}

	undo() {
		if (this.#undoStack.length === 0) return;
		const current = $state.snapshot(this.site) as Site;
		this.#redoStack.push(current);
		const prev = this.#undoStack.pop()!;
		this.site = prev;
		this.mode = { type: 'idle' };
	}

	redo() {
		if (this.#redoStack.length === 0) return;
		const current = $state.snapshot(this.site) as Site;
		this.#undoStack.push(current);
		const next = this.#redoStack.pop()!;
		this.site = next;
		this.mode = { type: 'idle' };
	}
}

export const store = new ModelerStore();
