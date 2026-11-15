import type { Part, Structure } from './types';

// A structure's floors, with any a plan adds on top of an existing building it keeps
export function addedStories(s: Structure): number {
	return s.status === 'removed' ? 0 : (s.addedStories ?? 0);
}

export function totalStories(s: Structure): number {
	return s.stories + addedStories(s);
}

export function partTotalHeight(s: Structure): number {
	return totalStories(s) * s.floorHeight;
}

export function roofHeight(part: Part): number {
	return 0.4 * Math.min(part.w, part.d);
}

export function gableRidgeAxis(part: Part): 'x' | 'z' {
	const axis = part.ridgeAxis ?? (part.w >= part.d ? 'w' : 'd');
	return axis === 'w' ? 'x' : 'z';
}
