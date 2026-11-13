// Plan view framing: which part of the site is on screen. View state, not Site data; it is
// never saved. The view is a center (site meters) and how many meters fit top to bottom.

import { getPartAABB } from './snap';
import { ftToM, M_TO_FT } from './units';
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
export const DEFAULT_VIEW: PlanView = { center: [0, 0], height: 100 };
const FIT_MARGIN = 1.2; // breathing room around fitted content
const BOARD_ZOOM_OUT = 1.1; // zoom out no further than the whole board plus a little

// Limits come from the board (half its width): the view center stays on it, and the view
// never shows much more than all of it.
export const maxViewHeight = (half: number) => 2 * half * BOARD_ZOOM_OUT;
const clampHeight = (h: number, half: number) => Math.min(maxViewHeight(half), Math.max(MIN_VIEW_HEIGHT, h));
const clampPan = (v: number, half: number) => Math.min(half, Math.max(-half, v));

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
export function fitView(bounds: Bounds | null, aspect: number, half: number): PlanView {
	if (!bounds) return DEFAULT_VIEW;
	const w = bounds.maxX - bounds.minX;
	const h = bounds.maxY - bounds.minY;
	return {
		center: [clampPan((bounds.minX + bounds.maxX) / 2, half), clampPan((bounds.minY + bounds.maxY) / 2, half)],
		height: clampHeight(Math.max(h, w / (aspect || 1)) * FIT_MARGIN, half),
	};
}

// Zooms by `factor` (above 1 shows more) while keeping the site point under the cursor still.
export function zoomAt(view: PlanView, factor: number, [px, py]: Pt, half: number): PlanView {
	const height = clampHeight(view.height * factor, half);
	const k = height / view.height;
	return {
		center: [clampPan(px + (view.center[0] - px) * k, half), clampPan(py + (view.center[1] - py) * k, half)],
		height,
	};
}

// Moves the view so the content follows a drag of (dx, dy) screen pixels.
export function panBy(view: PlanView, dx: number, dy: number, canvasHeight: number, half: number): PlanView {
	const metersPerPixel = view.height / canvasHeight;
	// Screen x matches site x; screen down is site +y (north is up)
	return {
		...view,
		center: [clampPan(view.center[0] - dx * metersPerPixel, half), clampPan(view.center[1] - dy * metersPerPixel, half)],
	};
}

const NICE_FEET = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const SCALE_TARGET = 0.1; // the bar aims for about a tenth of the view's height

// A scale bar that stays readable at any zoom: a round length in feet, and its width as a
// fraction of the view's height (the canvas sizes it in container-height units).
export function scaleBar(viewHeight: number): { feet: number; fraction: number } {
	const targetFeet = viewHeight * SCALE_TARGET * M_TO_FT;
	const feet = NICE_FEET.reduce((best, f) =>
		Math.abs(Math.log(f / targetFeet)) < Math.abs(Math.log(best / targetFeet)) ? f : best,
	);
	return { feet, fraction: ftToM(feet) / viewHeight };
}

// 3D orbit: the camera stays above whatever is under it (`top`, the highest thing in the
// model there, such as a roof) and above the ground, so it never sees under the board or from
// inside a hill or a building. Without terrain the ground is the flat board at y = 0.
export const CAMERA_CLEARANCE = 2;
export function cameraFloor(
	ground: { groundAt(x: number, y: number): number } | null,
	x: number,
	z: number,
	top: number | null = null,
): number {
	return Math.max(ground ? ground.groundAt(x, z) : 0, top ?? -Infinity) + CAMERA_CLEARANCE;
}
