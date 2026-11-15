import type { OpenSpace, Part } from './types';
import type { Snap } from './geo';

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
	| { type: 'drawingStructure'; points: [number, number][]; cursorPoint?: [number, number]; snap?: Snap }
	| { type: 'draggingVertex'; partId: string; index: number; outline: [number, number][]; snap?: Snap }
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
	| {
			type: 'cutting';
			structureId: string;
			start?: [number, number];
			cursor?: [number, number];
			missed?: boolean; // the last line didn't cross the building
	  }
	| {
			type: 'drawingZone';
			structureId: string;
			points: [number, number][];
			cursorPoint?: [number, number];
			missed?: boolean; // the last outline didn't overlap the building
	  }
	| { type: 'placingTree' }
	| { type: 'selectedTree'; treeId: string }
	| { type: 'draggingTree'; treeId: string; offsetX: number; offsetY: number };
