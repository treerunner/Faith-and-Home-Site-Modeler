export type Status = 'existing' | 'adaptive_reuse' | 'new' | 'removed';
export type Use =
	| 'worship'
	| 'fellowship'
	| 'education'
	| 'office'
	| 'housing'
	| 'community'
	| 'daycare'
	| 'social_services'
	| 'other';
export type Roof = 'flat' | 'gable' | 'object';

export interface Part {
	id: string;
	shape: 'rect' | 'square' | 'tri';
	x: number; // meters, local site coords (east-west)
	y: number; // meters, local site coords (north-south)
	w: number; // width (x-axis) meters
	d: number; // depth (y-axis) meters
	rotation: number; // degrees
	storiesOverride?: number;
}

export interface Structure {
	id: string;
	label: string;
	status: Status;
	uses: Use[];
	stories: number;
	floorHeight: number; // meters; default 3.5, nave default 9
	roof: Roof;
	parts: Part[];
	dwellings?: number;
	provenance: 'user' | 'osm' | 'overture';
}

export interface OpenSpace {
	id: string;
	kind: 'parking' | 'lawn' | 'courtyard' | 'court' | 'garden' | 'cemetery';
	polygon: [number, number][];
	label?: string;
}

export interface Site {
	id: string;
	name: string;
	mode: 'grid' | 'address';
	origin?: { lat: number; lng: number };
	parcel?: [number, number][];
	siteType?: 'urban' | 'suburban' | 'rural';
	structures: Structure[];
	openSpaces: OpenSpace[];
	context: { footprints: [number, number][][]; roads: [number, number][][] };
	annotations: { n: number; x: number; y: number; text: string }[];
}
