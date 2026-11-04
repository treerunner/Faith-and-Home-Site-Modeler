import type { Part, Structure } from './types';

export function partTotalHeight(s: Structure): number {
	return s.stories * s.floorHeight;
}

export function roofHeight(part: Part): number {
	return 0.4 * Math.min(part.w, part.d);
}

export function gableRidgeAxis(part: Part): 'x' | 'z' {
	return part.w >= part.d ? 'x' : 'z';
}
