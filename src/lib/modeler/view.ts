// Plan view framing: which part of the site is on screen. View state, not Site data; it is
// never saved. The view is a center (site meters) and how many meters fit top to bottom.

import { getPartAABB } from './snap';
import type { Plan } from './types';

type Pt = [number, number];

export interface PlanView {
	center: Pt;
	height: number;
}

export interface Bounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export const MIN_VIEW_HEIGHT = 20;
export const MAX_VIEW_HEIGHT = 320;
export const DEFAULT_VIEW: PlanView = { center: [0, 0], height: 100 };
const FIT_MARGIN = 1.2; // breathing room around fitted content
const MAX_PAN = 200; // the ground plane is 400 m across

const clampHeight = (h: number) => Math.min(MAX_VIEW_HEIGHT, Math.max(MIN_VIEW_HEIGHT, h));
const clampPan = (v: number) => Math.min(MAX_PAN, Math.max(-MAX_PAN, v));

// Everything worth framing: the parcel and the plan's structures, open spaces and trees.
export function contentBounds(plan: Plan, parcel?: Pt[]): Bounds | null {
	const xs: number[] = [];
	const ys: number[] = [];
	const add = ([x, y]: Pt) => { xs.push(x); ys.push(y); };
	parcel?.forEach(add);
	for (const s of plan.structures) {
		for (const p of s.parts) {
			const b = getPartAABB(p);
			add([b.minX, b.minY]);
			add([b.maxX, b.maxY]);
		}
	}
	for (const os of plan.openSpaces) os.polygon.forEach(add);
	for (const t of plan.trees) {
		add([t.x - t.radius, t.y - t.radius]);
		add([t.x + t.radius, t.y + t.radius]);
	}
	if (xs.length === 0) return null;
	return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// The view that shows the bounds with a margin, given the canvas width / height.
export function fitView(bounds: Bounds | null, aspect: number): PlanView {
	if (!bounds) return DEFAULT_VIEW;
	const w = bounds.maxX - bounds.minX;
	const h = bounds.maxY - bounds.minY;
	return {
		center: [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
		height: clampHeight(Math.max(h, w / (aspect || 1)) * FIT_MARGIN),
	};
}

// Zooms by `factor` (above 1 shows more) while keeping the site point under the cursor still.
export function zoomAt(view: PlanView, factor: number, [px, py]: Pt): PlanView {
	const height = clampHeight(view.height * factor);
	const k = height / view.height;
	return {
		center: [clampPan(px + (view.center[0] - px) * k), clampPan(py + (view.center[1] - py) * k)],
		height,
	};
}

// Moves the view so the content follows a drag of (dx, dy) screen pixels.
export function panBy(view: PlanView, dx: number, dy: number, canvasHeight: number): PlanView {
	const metersPerPixel = view.height / canvasHeight;
	// Screen x matches site x; screen down is site +y (north is up)
	return { ...view, center: [clampPan(view.center[0] - dx * metersPerPixel), clampPan(view.center[1] - dy * metersPerPixel)] };
}
