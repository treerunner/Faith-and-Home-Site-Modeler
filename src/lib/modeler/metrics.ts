import type { Part, Site, Structure } from './types';

export function partFootprint(part: Part): number {
	return part.w * part.d;
}

// Sum of part footprints (overlaps not subtracted until M4)
export function structureFootprint(structure: Structure): number {
	return structure.parts.reduce((sum, p) => sum + partFootprint(p), 0);
}

export function siteFootprint(site: Site): number {
	return site.structures.reduce((sum, s) => sum + structureFootprint(s), 0);
}

// Gross floor area: footprint × stories per structure
export function grossFloorArea(site: Site): number {
	return site.structures.reduce((sum, s) => sum + structureFootprint(s) * s.stories, 0);
}
