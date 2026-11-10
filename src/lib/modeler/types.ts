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
	ridgeAxis?: 'w' | 'd'; // pinned gable ridge direction; falls back to longer dimension if absent
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
	useWeights?: Partial<Record<Use, number>>; // relative allocation weights per selected use
	dwellings?: number;
	provenance: 'user' | 'osm' | 'overture';
	groupId?: string; // shared with other structures that move together
}

export interface OpenSpace {
	id: string;
	kind: 'parking' | 'lawn' | 'courtyard' | 'garden' | 'cemetery' | 'walkway';
	polygon: [number, number][];
	label?: string;
}

export interface CongregationProfile {
	size?: 'small' | 'medium' | 'large';
	tradition?: string;
	tenure?: 'new' | 'recent' | 'established' | 'historic';
	ownership?: 'owned' | 'leased';
	notes?: string;
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
	congregationProfile?: CongregationProfile;
}
