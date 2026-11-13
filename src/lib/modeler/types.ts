// What physically stands. Adaptive reuse is not a status: it is a ReuseZone inside an existing building.
export type Status = 'existing' | 'new' | 'removed';
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

// Part of an existing building proposed for reuse: an area on some floors, with a new use.
export interface ReuseZone {
	id: string;
	partId: string; // the part it sits in
	points: [number, number][]; // normalized to that part's w×d box, like poly outlines, so it follows the part
	floors: [number, number]; // inclusive; 1 is the ground floor, 0 the basement
	use: Use;
	dwellings?: number; // housing only; estimated from area until edited
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
	heightSource?: 'data' | 'default'; // where stories came from for prefilled buildings; cleared once edited
	groupId?: string; // shared with other structures that move together
	reuseZones?: ReuseZone[]; // existing structures only
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
	// Proposed culture questions, drafts for the team to review (see docs/PLAN.md)
	partnering?: 'open' | 'unsure' | 'not_now'; // would partner with a housing or community organization
	capacity?: 'volunteers' | 'some_staff' | 'staffed'; // who would steward a project
	change?: 'preserve' | 'adapt' | 'transform'; // how much change to the property feels right
	role?: 'gathering' | 'service' | 'housing_partner'; // role wanted in the neighborhood
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

// Pattern-book building types (see inferBuildingType in metrics.ts)
export type BuildingType = 'box' | 'box_plus' | 'object' | 'cluster';

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
	buildingTypeOverride?: BuildingType; // the user's choice over the inferred type
}

// Neighboring buildings (white foam) and roads (printed on the base board), in local meters.
export interface SiteContext {
	buildings: { polygon: [number, number][]; height: number }[];
	roads: { line: [number, number][]; kind: string }[]; // kind: OSM highway value
	sources?: ContextSource[]; // shown as attribution wherever the data appears
	buildingSources?: string[]; // where the footprints came from (Overture's @geometry_source); absent on sites saved before credits
	halfSize?: number; // board half-width in meters; absent means CONTEXT_HALF_SIZE (150)
}

export type ContextSource = 'overture' | 'pasda-lehigh';

// The property. Everything about the place itself lives here and is shared by its plans.
export interface Site {
	id: string;
	name: string;
	mode: 'grid' | 'address';
	address?: string;
	origin?: { lat: number; lng: number }; // local 0,0 in address mode
	parcel?: [number, number][];
	siteType?: 'urban' | 'suburban' | 'rural';
	// Does the main building present a clear front? An "object in space" church has none, or
	// several; footprints can't show this, so it is asked. Describes the building, so the
	// plans share it.
	mainBuildingFront?: 'clear' | 'none' | 'several';
	context: SiteContext;
	congregationProfile?: CongregationProfile;
	plans: Plan[];
}
