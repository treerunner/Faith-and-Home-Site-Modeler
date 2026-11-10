// Mirrored in src/app.css as CSS custom properties.
// Import here for three.js materials.

// F&H brand palette
export const FH = {
	dusk:           '#6a81b9',
	duskTint:       '#d2d9ea',
	lantern:        '#f7941d',
	lanternTint:    '#fddfbb',
	canopy:         '#49b187',
	canopyTint:     '#c8e8db',
	terracotta:     '#c55e61',
	terracottaTint: '#eecfd0',
	stone:          '#959192',
	stoneTint:      '#dfdede',
	linen:          '#f7f7f2',
	black:          '#181818',
} as const;

export const COLORS = {
	existing: FH.stone,
	reuse:    FH.canopy,
	new:      FH.lantern,
	removed:  FH.stoneTint,
	context:  FH.linen,
	base:     FH.linen,
	grid:     '#d9d8d7',
	gridSub:  '#e8e7e5',
	selection: FH.dusk,
} as const;

import type { OpenSpace, Status, Use } from './types';

export const USE_COLORS: Record<Use, string> = {
	worship:         FH.dusk,
	fellowship:      FH.canopy,
	education:       FH.lantern,
	office:          FH.stone,
	housing:         FH.terracotta,
	community:       '#8fa3cc',  // Dusk mid
	daycare:         '#74c4a0',  // Canopy mid
	social_services: '#d4858a',  // Terracotta mid
	other:           '#b5b2b3',  // Stone mid
};

export function statusColor(status: Status): string {
	const map: Record<Status, string> = {
		existing: COLORS.existing,
		adaptive_reuse: COLORS.reuse,
		new: COLORS.new,
		removed: COLORS.removed,
	};
	return map[status];
}

export const OPEN_SPACE_COLORS: Record<OpenSpace['kind'], string> = {
	parking:   FH.stone,
	lawn:      FH.canopyTint,
	courtyard: FH.linen,
	garden:    FH.canopy,
	cemetery:  '#6b6869',
	walkway:   '#c8c6c7',
};
