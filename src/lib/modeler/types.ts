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
	| 'kitchen'
	| 'other';
export type Roof = 'flat' | 'gable' | 'object';


// Shapes you can place from the palette; 'poly' only comes from real footprints (address mode)
export type PaletteShape = Exclude<Part['shape'], 'poly'>;

export interface Part {
	id: string;
	shape: 'rect' | 'square' | 'tri' | 'circle' | 'poly';
	x: number; // meters, local site coords (east-west)
	y: number; // meters, local site coords (north-south)
	w: number; // width (x-axis) meters
	d: number; // depth (y-axis) meters
	rotation: number; // degrees
	ridgeAxis?: 'w' | 'd'; // pinned gable ridge direction; falls back to longer dimension if absent
	storiesOverride?: number;
	points?: [number, number][]; // poly only: outline normalized to the w×d box, each coordinate in -0.5..0.5
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
	basement?: boolean;
	provenance: 'user' | 'osm' | 'overture';
	heightSource?: 'osm' | 'default'; // where stories came from for prefilled buildings; cleared once edited
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

export interface Tree {
	id: string;
	x: number;
	y: number;
	radius: number; // canopy radius in meters
	height: number; // total height in meters
}

export interface Annotation {
	n: number;
	x: number;
	y: number;
	text: string;
}

// One proposal (or the existing conditions) for a site.
export interface Plan {
	id: string;
	name: string;
	slug: string; // URL segment, unique within the site
	oldSlugs?: string[]; // previous slugs, so links survive renames
	structures: Structure[];
	openSpaces: OpenSpace[];
	trees: Tree[];
	annotations: Annotation[];
}

// Neighboring buildings (white foam) and roads (printed on the base board), in local meters.
export interface SiteContext {
	buildings: { polygon: [number, number][]; height: number }[];
	roads: { line: [number, number][]; kind: string }[]; // kind: OSM highway value
	sources?: ContextSource[]; // shown as attribution wherever the data appears
}

export type ContextSource = 'osm' | 'pasda-lehigh';

// The property. Everything about the place itself lives here and is shared by its plans.
export interface Site {
	id: string;
	name: string;
	mode: 'grid' | 'address';
	address?: string;
	origin?: { lat: number; lng: number }; // local 0,0 in address mode
	parcel?: [number, number][];
	siteType?: 'urban' | 'suburban' | 'rural';
	context: SiteContext;
	congregationProfile?: CongregationProfile;
	plans: Plan[];
}
