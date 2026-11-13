import type { Annotation, ContextSource, OpenSpace, Part, Plan, ReuseZone, Site, SiteContext, Structure, Tree, Use } from './types';
import { slugify } from './slug';
import { wholePartZone } from './geo';

// Validates a Site read from the database or posted to the API, and fills
// defaults for fields added after older sites were saved. Throws on bad input.
// Sites saved before plans existed are wrapped into one "Existing conditions" plan.

export class SiteFormatError extends Error {}

const SHAPES: Part['shape'][] = ['rect', 'square', 'tri', 'circle', 'poly'];
const STATUSES: Structure['status'][] = ['existing', 'new', 'removed'];
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
const CONTEXT_SOURCES: ContextSource[] = ['overture', 'pasda-lehigh'];

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
	const shape = oneOf(o.shape, SHAPES, `${path}.shape`);
	const points = optional(o.points, (p) => polygon(p, `${path}.points`));
	if (shape === 'poly' && (!points || points.length < 3)) fail(`${path}.points`, 'poly parts need at least 3 points');
	return {
		id: str(o.id, `${path}.id`),
		shape,
		x: num(o.x, `${path}.x`),
		y: num(o.y, `${path}.y`),
		w: num(o.w, `${path}.w`),
		d: num(o.d, `${path}.d`),
		rotation: num(o.rotation ?? 0, `${path}.rotation`),
		ridgeAxis: optional(o.ridgeAxis, (r) => oneOf(r, ['w', 'd'] as const, `${path}.ridgeAxis`)),
		storiesOverride: optional(o.storiesOverride, (n) => num(n, `${path}.storiesOverride`)),
		points: shape === 'poly' ? points : undefined,
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
	// Before reuse zones, reuse was a status covering the whole building
	const legacyReuse = o.status === 'adaptive_reuse';
	const uses = arr(o.uses ?? [], `${path}.uses`).map((u, i) => oneOf(u, USES, `${path}.uses[${i}]`));
	const stories = num(o.stories ?? 1, `${path}.stories`);
	const parts = arr(o.parts, `${path}.parts`).map((p, i) => parsePart(p, `${path}.parts[${i}]`));
	const dwellings = optional(o.dwellings, (n) => num(n, `${path}.dwellings`));
	const partIds = new Set(parts.map((p) => p.id));
	let reuseZones = optional(o.reuseZones, (v) =>
		arr(v, `${path}.reuseZones`).map((z, i) => parseZone(z, `${path}.reuseZones[${i}]`, partIds)),
	);
	if (legacyReuse) {
		const mainUse = [...uses].sort((a, b) => (useWeights?.[b] ?? 50) - (useWeights?.[a] ?? 50))[0] ?? 'other';
		reuseZones = parts.map((part, i) => ({
			id: `${String(o.id)}-reuse-${i}`,
			partId: part.id,
			points: wholePartZone(part),
			floors: [1, stories] as [number, number],
			use: mainUse,
			dwellings: i === 0 ? dwellings : undefined,
		}));
	}
	return {
		id: str(o.id, `${path}.id`),
		label: str(o.label ?? '', `${path}.label`),
		status: legacyReuse ? 'existing' : oneOf(o.status, STATUSES, `${path}.status`),
		uses,
		stories,
		floorHeight: num(o.floorHeight ?? 3.5, `${path}.floorHeight`),
		roof: oneOf(o.roof ?? 'flat', ROOFS, `${path}.roof`),
		parts,
		useWeights,
		// A converted reuse building's units move to its zone
		dwellings: legacyReuse ? undefined : dwellings,
		basement: optional(o.basement, (b) => {
			if (typeof b !== 'boolean') fail(`${path}.basement`, 'expected boolean');
			return b;
		}),
		provenance: oneOf(o.provenance ?? 'user', PROVENANCES, `${path}.provenance`),
		heightSource: optional(o.heightSource, (h) => oneOf(h, ['data', 'default'] as const, `${path}.heightSource`)),
		groupId: optional(o.groupId, (g) => str(g, `${path}.groupId`)),
		reuseZones: reuseZones?.length ? reuseZones : undefined,
	};
}

function parseZone(v: unknown, path: string, partIds: Set<string>): ReuseZone {
	const o = obj(v, path);
	const partId = str(o.partId, `${path}.partId`);
	if (!partIds.has(partId)) fail(`${path}.partId`, 'not a part of this structure');
	const floors = arr(o.floors, `${path}.floors`);
	if (floors.length !== 2) fail(`${path}.floors`, 'expected [from, to]');
	const [from, to] = [num(floors[0], `${path}.floors[0]`), num(floors[1], `${path}.floors[1]`)];
	if (from < 0 || to < from) fail(`${path}.floors`, 'expected 0 <= from <= to');
	const points = polygon(o.points, `${path}.points`);
	if (points.length < 3) fail(`${path}.points`, 'expected at least 3 points');
	return {
		id: str(o.id, `${path}.id`),
		partId,
		points,
		floors: [from, to],
		use: oneOf(o.use, USES, `${path}.use`),
		dwellings: optional(o.dwellings, (n) => num(n, `${path}.dwellings`)),
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

function parseAnnotation(v: unknown, path: string): Annotation {
	const o = obj(v, path);
	return { n: num(o.n, `${path}.n`), x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`), text: str(o.text, `${path}.text`) };
}

// The plan-level fields, shared by plans and by legacy sites that stored them at the top level.
function parsePlanContent(o: Obj, path: string): Pick<Plan, 'structures' | 'openSpaces' | 'trees' | 'annotations'> {
	return {
		structures: arr(o.structures ?? [], `${path}.structures`).map((s, i) =>
			parseStructure(s, `${path}.structures[${i}]`),
		),
		openSpaces: arr(o.openSpaces ?? [], `${path}.openSpaces`).map((s, i) =>
			parseOpenSpace(s, `${path}.openSpaces[${i}]`),
		),
		trees: arr(o.trees ?? [], `${path}.trees`).map((t, i) => parseTree(t, `${path}.trees[${i}]`)),
		annotations: arr(o.annotations ?? [], `${path}.annotations`).map((a, i) =>
			parseAnnotation(a, `${path}.annotations[${i}]`),
		),
	};
}

function parsePlan(v: unknown, path: string): Plan {
	const o = obj(v, path);
	const name = str(o.name ?? '', `${path}.name`);
	return {
		id: str(o.id, `${path}.id`),
		name,
		slug: str(o.slug ?? slugify(name), `${path}.slug`),
		oldSlugs: optional(o.oldSlugs, (v) =>
			arr(v, `${path}.oldSlugs`).map((s, i) => str(s, `${path}.oldSlugs[${i}]`)),
		),
		buildingTypeOverride: optional(o.buildingTypeOverride, (v) =>
			oneOf(v, ['box', 'box_plus', 'object', 'cluster'] as const, `${path}.buildingTypeOverride`),
		),
		developmentTypeOverride: optional(o.developmentTypeOverride, (v) =>
			oneOf(v, ['existing', 'reuse', 'new', 'reuse_new', 'downsize_sell'] as const, `${path}.developmentTypeOverride`),
		),
		...parsePlanContent(o, path),
	};
}

// Before M6, context was { footprints: polygon[], roads: line[] } and always empty in practice.
function parseContext(v: unknown): SiteContext {
	const o = v === undefined ? {} : obj(v, 'site.context');
	const path = 'site.context';
	const buildings = arr(o.buildings ?? [], `${path}.buildings`).map((b, i) => {
		const bo = obj(b, `${path}.buildings[${i}]`);
		return { polygon: polygon(bo.polygon, `${path}.buildings[${i}].polygon`), height: num(bo.height, `${path}.buildings[${i}].height`) };
	});
	const legacyFootprints = arr(o.footprints ?? [], `${path}.footprints`).map((p, i) => ({
		polygon: polygon(p, `${path}.footprints[${i}]`),
		height: 8,
	}));
	const roads = arr(o.roads ?? [], `${path}.roads`).map((r, i) =>
		Array.isArray(r)
			? { line: polygon(r, `${path}.roads[${i}]`), kind: 'residential' }
			: (() => {
					const ro = obj(r, `${path}.roads[${i}]`);
					return { line: polygon(ro.line, `${path}.roads[${i}].line`), kind: str(ro.kind ?? 'residential', `${path}.roads[${i}].kind`) };
				})(),
	);
	const sources = optional(o.sources, (v) =>
		arr(v, `${path}.sources`).map((s, i) => oneOf(s, CONTEXT_SOURCES, `${path}.sources[${i}]`)),
	);
	const halfSize = optional(o.halfSize, (n) => num(n, `${path}.halfSize`));
	const buildingSources = optional(o.buildingSources, (v) =>
		arr(v, `${path}.buildingSources`).map((s, i) => str(s, `${path}.buildingSources[${i}]`)),
	);
	return { buildings: [...buildings, ...legacyFootprints], roads, sources, halfSize, buildingSources };
}

export const DEFAULT_PLAN_NAME = 'Existing conditions';

export function normalizeSite(raw: unknown): Site {
	const o = obj(raw, 'site');
	const id = str(o.id, 'site.id');
	const context = parseContext(o.context);
	const profile = optional(o.congregationProfile, (p) => obj(p, 'site.congregationProfile'));

	const plans =
		o.plans === undefined
			? [{ id, name: DEFAULT_PLAN_NAME, slug: slugify(DEFAULT_PLAN_NAME), ...parsePlanContent(o, 'site') }]
			: arr(o.plans, 'site.plans').map((p, i) => parsePlan(p, `site.plans[${i}]`));
	if (plans.length === 0) fail('site.plans', 'expected at least one plan');
	const ids = new Set<string>();
	const slugs = new Set<string>();
	plans.forEach((p, i) => {
		if (ids.has(p.id)) fail(`site.plans[${i}].id`, 'duplicate plan id');
		ids.add(p.id);
		for (const slug of [p.slug, ...(p.oldSlugs ?? [])]) {
			if (slugs.has(slug)) fail(`site.plans[${i}].slug`, `duplicate plan slug ${slug}`);
			slugs.add(slug);
		}
	});

	const site: Site = {
		id,
		name: str(o.name ?? '', 'site.name'),
		mode: oneOf(o.mode ?? 'grid', ['grid', 'address'] as const, 'site.mode'),
		address: optional(o.address, (a) => str(a, 'site.address')),
		origin: optional(o.origin, (v) => {
			const g = obj(v, 'site.origin');
			return { lat: num(g.lat, 'site.origin.lat'), lng: num(g.lng, 'site.origin.lng') };
		}),
		parcel: optional(o.parcel, (v) => polygon(v, 'site.parcel')),
		siteType: optional(o.siteType, (v) => oneOf(v, SITE_TYPES, 'site.siteType')),
		mainBuildingFront: optional(o.mainBuildingFront, (v) =>
			oneOf(v, ['clear', 'none', 'several'] as const, 'site.mainBuildingFront'),
		),
		context,
		// Free-form questionnaire answers; keep only string values
		congregationProfile: profile
			? (Object.fromEntries(
					Object.entries(profile).filter(([, v]) => typeof v === 'string'),
				) as Site['congregationProfile'])
			: undefined,
		plans,
	};
	return stripUndefined(site);
}

// JSON round trips drop undefined keys; do the same so saved and loaded sites compare equal.
function stripUndefined<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}
