// Mirrored in src/app.css as CSS custom properties.
// Import here for three.js materials.
export const COLORS = {
	existing: '#9b9486',
	reuse: '#5c7a4e',
	new: '#c96e2f',
	removed: '#aaaaaa',
	context: '#f5f0e8',
	base: '#f0ebe0',
	grid: '#d4c5a9',
	gridSub: '#e8deca',
	selection: '#2563eb',
} as const;

import type { OpenSpace, Status } from './types';

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
	parking: '#b5b0aa',
	lawn: '#a8c090',
	courtyard: '#d4c5a9',
	court: '#9bb8cc',
	garden: '#8faf7a',
	cemetery: '#8a8a8a',
};
