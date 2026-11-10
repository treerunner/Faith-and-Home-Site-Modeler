import type { Part, Structure } from './types';

export function partTotalHeight(s: Structure): number {
	return s.stories * s.floorHeight;
}

export function roofHeight(part: Part): number {
	return 0.4 * Math.min(part.w, part.d);
}

export function gableRidgeAxis(part: Part): 'x' | 'z' {
	const axis = part.ridgeAxis ?? (part.w >= part.d ? 'w' : 'd');
	return axis === 'w' ? 'x' : 'z';
}
