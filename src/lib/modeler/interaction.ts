import type { OpenSpace, Part } from './types';

export type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

export type InteractionMode =
	| { type: 'idle' }
	| { type: 'placing'; shape: Part['shape']; ghostX: number; ghostY: number }
	| { type: 'selected'; partId: string }
	| {
			type: 'dragging';
			partId: string;
			offsetX: number;
			offsetY: number;
			companions: { id: string; initialX: number; initialY: number }[];
			cloning?: boolean;
	  }
	| { type: 'resizing'; partId: string; handle: ResizeHandle; anchorX: number; anchorY: number; initialW: number; initialD: number }
	| {
			type: 'rotating';
			partId: string;
			centerX: number;
			centerY: number;
			startAngle: number;
			startRotation: number;
	  }
	| {
			type: 'drawingOpenSpace';
			kind: OpenSpace['kind'];
			points: [number, number][];
			cursorPoint?: [number, number];
	  }
	| { type: 'selectedOpenSpace'; openSpaceId: string }
	| {
			type: 'draggingOpenSpace';
			openSpaceId: string;
			origPolygon: [number, number][];
			anchorX: number;
			anchorY: number;
	  }
	| {
			type: 'draggingOsVertex';
			openSpaceId: string;
			vertexIndex: number;
			origPolygon: [number, number][];
	  }
	| { type: 'choosingParcel'; hoverId?: string }
	| { type: 'drawingParcel'; points: [number, number][]; cursorPoint?: [number, number] }
	| { type: 'placingTree' }
	| { type: 'selectedTree'; treeId: string }
	| { type: 'draggingTree'; treeId: string; offsetX: number; offsetY: number };
