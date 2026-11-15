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

// How far above its host's base a rooftop piece starts: the host's full height, stories a plan
// added included, so it rides the host's stack. On a pitched roof it sits at the eaves. Hosts
// can chain (a lantern on a drum); a loop counts as the ground.
export function roofBase(s: Structure, structures: Structure[]): number {
	let height = 0;
	const seen = new Set([s.id]);
	for (let host = hostOf(s, structures); host; host = hostOf(host, structures)) {
		if (seen.has(host.id)) return 0;
		seen.add(host.id);
		height += partTotalHeight(host);
	}
	return height;
}

function hostOf(s: Structure, structures: Structure[]): Structure | undefined {
	return s.onRoofOf ? structures.find((h) => h.id === s.onRoofOf) : undefined;
}

// How many roofs up a piece is: 0 on the ground
export function roofLevel(s: Structure, structures: Structure[]): number {
	let level = 0;
	const seen = new Set([s.id]);
	for (let host = hostOf(s, structures); host && !seen.has(host.id); host = hostOf(host, structures)) {
		seen.add(host.id);
		level++;
	}
	return level;
}

// Rooftop pieces whose host is gone, or that would rest on themselves, go back to the ground
export function settleRoofHosts(structures: Structure[]): Structure[] {
	return structures.map((s) => {
		if (!s.onRoofOf) return s;
		const ok = structures.some((h) => h.id === s.onRoofOf) && roofLevel(s, structures) > 0 && !restsOn(structures, s.onRoofOf, s.id);
		return ok ? s : { ...s, onRoofOf: undefined };
	});
}

// Whether `id` rests, directly or up a chain, on `hostId`
export function restsOn(structures: Structure[], id: string, hostId: string): boolean {
	const seen = new Set<string>();
	for (let s = structures.find((x) => x.id === id); s?.onRoofOf && !seen.has(s.id); s = structures.find((x) => x.id === s!.onRoofOf)) {
		seen.add(s.id);
		if (s.onRoofOf === hostId) return true;
	}
	return false;
}

export function roofHeight(part: Part): number {
	return 0.4 * Math.min(part.w, part.d);
}

export function gableRidgeAxis(part: Part): 'x' | 'z' {
	const axis = part.ridgeAxis ?? (part.w >= part.d ? 'w' : 'd');
	return axis === 'w' ? 'x' : 'z';
}
