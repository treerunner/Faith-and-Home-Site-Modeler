import type { Part } from './types';

export type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

export type InteractionMode =
	| { type: 'idle' }
	| { type: 'placing'; shape: Part['shape']; ghostX: number; ghostY: number }
	| { type: 'selected'; partId: string }
	| { type: 'dragging'; partId: string; offsetX: number; offsetY: number }
	| { type: 'resizing'; partId: string; handle: ResizeHandle; anchorX: number; anchorY: number }
	| {
			type: 'rotating';
			partId: string;
			centerX: number;
			centerY: number;
			startAngle: number;
			startRotation: number;
	  };
