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
