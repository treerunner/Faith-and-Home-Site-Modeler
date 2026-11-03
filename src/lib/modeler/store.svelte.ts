import type { Part, Site, Structure } from './types';
import type { InteractionMode, ResizeHandle } from './interaction';
import { snapEdge, snapToGrid } from './snap';

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
		structures: [
			{
				id: crypto.randomUUID(),
				label: 'Structure',
				status: 'existing',
				uses: ['worship'],
				stories: 1,
				floorHeight: 3.5,
				roof: 'flat',
				parts: [],
				provenance: 'user',
			} satisfies Structure,
		],
		openSpaces: [],
		context: { footprints: [], roads: [] },
		annotations: [],
	};
}

class ModelerStore {
	site = $state<Site>(makeSite());
	mode = $state<InteractionMode>({ type: 'idle' });

	readonly #undoStack: Site[] = [];
	readonly #redoStack: Site[] = [];

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
		this.site.structures[0].parts.push(part);
		this.mode = { type: 'selected', partId: part.id };
	}

	selectPart(id: string | null) {
		this.mode = id ? { type: 'selected', partId: id } : { type: 'idle' };
	}

	startDragging(id: string, offsetX: number, offsetY: number) {
		this.#pushUndo();
		this.mode = { type: 'dragging', partId: id, offsetX, offsetY };
	}

	updateDrag(worldX: number, worldY: number) {
		if (this.mode.type !== 'dragging') return;
		const { partId, offsetX, offsetY } = this.mode;
		const rawX = worldX - offsetX;
		const rawY = worldY - offsetY;
		const part = this.#findPart(partId);
		if (!part) return;
		const tempPart = { ...part, x: rawX, y: rawY };
		const others = this.allParts;
		const snapped = snapEdge(tempPart, others);
		this.#mutPart(partId, (p) => {
			p.x = snapToGrid(snapped.x);
			p.y = snapToGrid(snapped.y);
		});
	}

	endDrag() {
		if (this.mode.type !== 'dragging') return;
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	startResizing(id: string, handle: ResizeHandle) {
		const part = this.#findPart(id);
		if (!part) return;
		this.#pushUndo();
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
	}

	endResize() {
		if (this.mode.type !== 'resizing') return;
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	startRotating(id: string, mouseX: number, mouseY: number) {
		const part = this.#findPart(id);
		if (!part) return;
		this.#pushUndo();
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
	}

	endRotation() {
		if (this.mode.type !== 'rotating') return;
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	rotatePart(id: string, delta: number) {
		this.#pushUndo();
		this.#mutPart(id, (p) => {
			p.rotation = ((p.rotation + delta) % 360 + 360) % 360;
		});
	}

	deletePart(id: string) {
		this.#pushUndo();
		for (const s of this.site.structures) {
			const idx = s.parts.findIndex((p) => p.id === id);
			if (idx !== -1) {
				s.parts.splice(idx, 1);
				break;
			}
		}
		this.mode = { type: 'idle' };
	}

	updateGhostPos(shape: Part['shape'], ghostX: number, ghostY: number) {
		this.mode = { type: 'placing', shape, ghostX, ghostY };
	}

	cancelPlacing() {
		this.mode = { type: 'idle' };
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
