import type { Part } from './types';

export function snapToGrid(v: number, step = 1): number {
	return Math.round(v / step) * step;
}

function deg2rad(deg: number): number {
	return (deg * Math.PI) / 180;
}

// Returns the 4 corners of a part in site coordinates, accounting for rotation.
export function getPartCorners(part: Part): [number, number][] {
	const hw = part.w / 2;
	const hd = part.d / 2;
	const r = deg2rad(part.rotation);
	const cos = Math.cos(r);
	const sin = Math.sin(r);
	const local: [number, number][] = [
		[-hw, -hd],
		[hw, -hd],
		[hw, hd],
		[-hw, hd],
	];
	return local.map(([lx, ly]) => [part.x + lx * cos - ly * sin, part.y + lx * sin + ly * cos]);
}

export interface AABB {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

// Axis-aligned bounding box of a part (accounts for rotation).
export function getPartAABB(part: Part): AABB {
	const corners = getPartCorners(part);
	const xs = corners.map((c) => c[0]);
	const ys = corners.map((c) => c[1]);
	return {
		minX: Math.min(...xs),
		maxX: Math.max(...xs),
		minY: Math.min(...ys),
		maxY: Math.max(...ys),
	};
}

const DEFAULT_THRESHOLD = 0.75; // meters

// Snap a moving part's edges to nearby edges of other parts.
// Returns corrected { x, y } center for the moving part.
export function snapEdge(
	moving: Part,
	others: Part[],
	threshold = DEFAULT_THRESHOLD,
): { x: number; y: number } {
	const mBox = getPartAABB(moving);
	let bestX = moving.x;
	let bestY = moving.y;
	let distX = threshold + 1;
	let distY = threshold + 1;

	for (const other of others) {
		if (other.id === moving.id) continue;
		const oBox = getPartAABB(other);

		const candidatesX: [number, number][] = [
			[mBox.minX, oBox.minX],
			[mBox.minX, oBox.maxX],
			[mBox.maxX, oBox.minX],
			[mBox.maxX, oBox.maxX],
		];
		for (const [edge, target] of candidatesX) {
			const d = Math.abs(edge - target);
			if (d < distX) {
				distX = d;
				bestX = moving.x + (target - edge);
			}
		}

		const candidatesY: [number, number][] = [
			[mBox.minY, oBox.minY],
			[mBox.minY, oBox.maxY],
			[mBox.maxY, oBox.minY],
			[mBox.maxY, oBox.maxY],
		];
		for (const [edge, target] of candidatesY) {
			const d = Math.abs(edge - target);
			if (d < distY) {
				distY = d;
				bestY = moving.y + (target - edge);
			}
		}
	}

	return {
		x: distX <= threshold ? bestX : moving.x,
		y: distY <= threshold ? bestY : moving.y,
	};
}

// Rotation while dragging the handle: lines up with a nearby building's walls when within
// `tolerance` degrees of one (any of the four ways a rectangle can face it), otherwise turns in
// 15° steps from where it started. Angles in degrees, Part.rotation's convention.
export function snapRotation(start: number, delta: number, wallAngles: number[], tolerance = 4): { rotation: number; aligned: boolean } {
	const raw = start + delta;
	let best: number | null = null;
	for (const a of wallAngles) {
		const off = ((((raw - a) % 90) + 135) % 90) - 45; // signed distance to the wall's nearest quarter turn
		if (Math.abs(off) <= tolerance && (best === null || Math.abs(off) < Math.abs(best))) best = off;
	}
	const rotation = best !== null ? raw - best : start + Math.round(delta / 15) * 15;
	return { rotation: Math.round((((rotation % 360) + 360) % 360) * 100) / 100, aligned: best !== null };
}

// The directions of polygon edges, in degrees: what a turning piece can line up with
export function edgeAngles(outlines: [number, number][][]): number[] {
	const out = new Set<number>();
	for (const ring of outlines) {
		for (let i = 0; i < ring.length; i++) {
			const [x1, y1] = ring[i];
			const [x2, y2] = ring[(i + 1) % ring.length];
			if (Math.hypot(x2 - x1, y2 - y1) < 2) continue; // short jogs and circle facets aren't walls to line up with
			out.add(Math.round((((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 360) % 90) * 10) / 10);
		}
	}
	return [...out];
}
