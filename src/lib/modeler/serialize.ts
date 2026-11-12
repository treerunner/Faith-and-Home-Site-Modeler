import type { OpenSpace, Part, Site, Structure, Tree, Use } from './types';

// Validates a Site read from the database or posted to the API, and fills
// defaults for fields added after older sites were saved. Throws on bad input.

export class SiteFormatError extends Error {}

const SHAPES: Part['shape'][] = ['rect', 'square', 'tri', 'circle'];
const STATUSES: Structure['status'][] = ['existing', 'adaptive_reuse', 'new', 'removed'];
const USES: Use[] = [
	'worship', 'fellowship', 'education', 'office', 'housing',
	'community', 'daycare', 'social_services', 'kitchen', 'other',
];
const ROOFS: Structure['roof'][] = ['flat', 'gable', 'object'];
const PROVENANCES: Structure['provenance'][] = ['user', 'osm', 'overture'];
const OPEN_SPACE_KINDS: OpenSpace['kind'][] = [
	'parking', 'lawn', 'courtyard', 'garden', 'cemetery', 'walkway',
];
const SITE_TYPES: NonNullable<Site['siteType']>[] = ['urban', 'suburban', 'rural'];

type Obj = Record<string, unknown>;

function fail(path: string, msg: string): never {
	throw new SiteFormatError(`${path}: ${msg}`);
}

function obj(v: unknown, path: string): Obj {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected object');
	return v as Obj;
}

function arr(v: unknown, path: string): unknown[] {
	if (!Array.isArray(v)) fail(path, 'expected array');
	return v;
}

function str(v: unknown, path: string): string {
	if (typeof v !== 'string') fail(path, 'expected string');
	return v;
}

function num(v: unknown, path: string): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected number');
	return v;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
	if (!options.includes(v as T)) fail(path, `expected one of ${options.join(', ')}`);
	return v as T;
}

function optional<T>(v: unknown, parse: (v: unknown) => T): T | undefined {
	return v === undefined || v === null ? undefined : parse(v);
}

function point(v: unknown, path: string): [number, number] {
	const a = arr(v, path);
	if (a.length !== 2) fail(path, 'expected [x, y]');
	return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
}

function polygon(v: unknown, path: string): [number, number][] {
	return arr(v, path).map((p, i) => point(p, `${path}[${i}]`));
}

function parsePart(v: unknown, path: string): Part {
	const o = obj(v, path);
	return {
		id: str(o.id, `${path}.id`),
		shape: oneOf(o.shape, SHAPES, `${path}.shape`),
		x: num(o.x, `${path}.x`),
		y: num(o.y, `${path}.y`),
		w: num(o.w, `${path}.w`),
		d: num(o.d, `${path}.d`),
		rotation: num(o.rotation ?? 0, `${path}.rotation`),
		ridgeAxis: optional(o.ridgeAxis, (r) => oneOf(r, ['w', 'd'] as const, `${path}.ridgeAxis`)),
		storiesOverride: optional(o.storiesOverride, (n) => num(n, `${path}.storiesOverride`)),
	};
}

function parseStructure(v: unknown, path: string): Structure {
	const o = obj(v, path);
	let useWeights: Structure['useWeights'];
	if (o.useWeights !== undefined && o.useWeights !== null) {
		const w = obj(o.useWeights, `${path}.useWeights`);
		useWeights = {};
		for (const [k, val] of Object.entries(w)) {
			useWeights[oneOf(k, USES, `${path}.useWeights`)] = num(val, `${path}.useWeights.${k}`);
		}
	}
	return {
		id: str(o.id, `${path}.id`),
		label: str(o.label ?? '', `${path}.label`),
		status: oneOf(o.status, STATUSES, `${path}.status`),
		uses: arr(o.uses ?? [], `${path}.uses`).map((u, i) => oneOf(u, USES, `${path}.uses[${i}]`)),
		stories: num(o.stories ?? 1, `${path}.stories`),
		floorHeight: num(o.floorHeight ?? 3.5, `${path}.floorHeight`),
		roof: oneOf(o.roof ?? 'flat', ROOFS, `${path}.roof`),
		parts: arr(o.parts, `${path}.parts`).map((p, i) => parsePart(p, `${path}.parts[${i}]`)),
		useWeights,
		dwellings: optional(o.dwellings, (n) => num(n, `${path}.dwellings`)),
		basement: optional(o.basement, (b) => {
			if (typeof b !== 'boolean') fail(`${path}.basement`, 'expected boolean');
			return b;
		}),
		provenance: oneOf(o.provenance ?? 'user', PROVENANCES, `${path}.provenance`),
		groupId: optional(o.groupId, (g) => str(g, `${path}.groupId`)),
	};
}

function parseOpenSpace(v: unknown, path: string): OpenSpace {
	const o = obj(v, path);
	return {
		id: str(o.id, `${path}.id`),
		kind: oneOf(o.kind, OPEN_SPACE_KINDS, `${path}.kind`),
		polygon: polygon(o.polygon, `${path}.polygon`),
		label: optional(o.label, (l) => str(l, `${path}.label`)),
	};
}

function parseTree(v: unknown, path: string): Tree {
	const o = obj(v, path);
	return {
		id: str(o.id, `${path}.id`),
		x: num(o.x, `${path}.x`),
		y: num(o.y, `${path}.y`),
		radius: num(o.radius ?? 2.5, `${path}.radius`),
		height: num(o.height ?? 8, `${path}.height`),
	};
}

export function normalizeSite(raw: unknown): Site {
	const o = obj(raw, 'site');
	const context = o.context === undefined ? {} : obj(o.context, 'site.context');
	const profile = optional(o.congregationProfile, (p) => obj(p, 'site.congregationProfile'));

	const site: Site = {
		id: str(o.id, 'site.id'),
		name: str(o.name ?? '', 'site.name'),
		mode: oneOf(o.mode ?? 'grid', ['grid', 'address'] as const, 'site.mode'),
		origin: optional(o.origin, (v) => {
			const g = obj(v, 'site.origin');
			return { lat: num(g.lat, 'site.origin.lat'), lng: num(g.lng, 'site.origin.lng') };
		}),
		parcel: optional(o.parcel, (v) => polygon(v, 'site.parcel')),
		siteType: optional(o.siteType, (v) => oneOf(v, SITE_TYPES, 'site.siteType')),
		structures: arr(o.structures ?? [], 'site.structures').map((s, i) =>
			parseStructure(s, `site.structures[${i}]`),
		),
		openSpaces: arr(o.openSpaces ?? [], 'site.openSpaces').map((s, i) =>
			parseOpenSpace(s, `site.openSpaces[${i}]`),
		),
		trees: arr(o.trees ?? [], 'site.trees').map((t, i) => parseTree(t, `site.trees[${i}]`)),
		context: {
			footprints: arr(context.footprints ?? [], 'site.context.footprints').map((p, i) =>
				polygon(p, `site.context.footprints[${i}]`),
			),
			roads: arr(context.roads ?? [], 'site.context.roads').map((p, i) =>
				polygon(p, `site.context.roads[${i}]`),
			),
		},
		annotations: arr(o.annotations ?? [], 'site.annotations').map((a, i) => {
			const p = `site.annotations[${i}]`;
			const ao = obj(a, p);
			return { n: num(ao.n, `${p}.n`), x: num(ao.x, `${p}.x`), y: num(ao.y, `${p}.y`), text: str(ao.text, `${p}.text`) };
		}),
		// Free-form questionnaire answers; keep only string values
		congregationProfile: profile
			? (Object.fromEntries(
					Object.entries(profile).filter(([, v]) => typeof v === 'string'),
				) as Site['congregationProfile'])
			: undefined,
	};
	return stripUndefined(site);
}

// JSON round trips drop undefined keys; do the same so saved and loaded sites compare equal.
function stripUndefined<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}
