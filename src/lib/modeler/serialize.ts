import type { Annotation, ContextSource, OpenSpace, Part, Plan, ReuseZone, Site, SiteContext, Structure, Terrain, TerrainRegion, Tree, Use } from './types';
import { slugify } from './slug';
import { CONTEXT_HALF_SIZE, wholePartZone } from './geo';
import { choicesOf, expandPlan, type ExistingChoice, type ExistingChoices } from './existing';
import { settleRoofHosts } from './geometry';

// Validates a Site read from the database or posted to the API, and fills
// defaults for fields added after older sites were saved. Throws on bad input.
// Sites saved before plans existed are wrapped into one "Existing conditions" plan. Sites saved
// before the site view (no `existing`) take their existing conditions from the first plan.

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

function parseUses(v: unknown, path: string): Use[] {
	return arr(v, path).map((u, i) => oneOf(u, USES, `${path}[${i}]`));
}

function parseWeights(v: unknown, path: string): Structure['useWeights'] {
	if (v === undefined || v === null) return undefined;
	const w = obj(v, path);
	const out: NonNullable<Structure['useWeights']> = {};
	for (const [k, val] of Object.entries(w)) out[oneOf(k, USES, path)] = num(val, `${path}.${k}`);
	return out;
}

function parseStructure(v: unknown, path: string): Structure {
	const o = obj(v, path);
	const useWeights = parseWeights(o.useWeights, `${path}.useWeights`);
	// Before reuse zones, reuse was a status covering the whole building
	const legacyReuse = o.status === 'adaptive_reuse';
	const uses = parseUses(o.uses ?? [], `${path}.uses`);
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
		onRoofOf: optional(o.onRoofOf, (g) => str(g, `${path}.onRoofOf`)),
		reuseZones: reuseZones?.length ? reuseZones : undefined,
		addedStories: optional(o.addedStories, (n) => num(n, `${path}.addedStories`)) || undefined,
		planRoof: optional(o.planRoof, (v) => oneOf(v, ROOFS, `${path}.planRoof`)),
		planUses: optional(o.planUses, (v) => parseUses(v, `${path}.planUses`)),
		planUseWeights: parseWeights(o.planUseWeights, `${path}.planUseWeights`),
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
		addedStories: optional(o.addedStories, (n) => num(n, `${path}.addedStories`)) || undefined,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Plans are rows keyed by uuid; ids from older saves (like "p") become a uuid made from them,
// the same every time, so the browser and the server agree
export function planUuid(id: string): string {
	if (UUID.test(id)) return id.toLowerCase();
	let hex = '';
	for (let seed = 0; hex.length < 32; seed++) {
		let h = 0x811c9dc5 ^ seed;
		for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
		hex += h.toString(16).padStart(8, '0');
	}
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parsePlan(v: unknown, path: string): Plan {
	const o = obj(v, path);
	const name = str(o.name ?? '', `${path}.name`);
	return {
		id: planUuid(str(o.id, `${path}.id`)),
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
	const terrain = parseTerrain(o.terrain, halfSize ?? CONTEXT_HALF_SIZE);
	return { buildings: [...buildings, ...legacyFootprints], roads, sources, halfSize, buildingSources, terrain };
}

const TERRAIN_REGIONS: unknown[] = ['world', 'au', 'at', 'ca', 'eu', 'mx', 'nz', 'no', 'uk'] satisfies TerrainRegion[];

// Malformed terrain is dropped rather than rejected: the board just loads flat. The grid must
// be square and span the board exactly.
function parseTerrain(v: unknown, half: number): Terrain | undefined {
	if (!v || typeof v !== 'object') return undefined;
	const { spacing, heights } = v as Record<string, unknown>;
	if (typeof spacing !== 'number' || !(spacing > 0) || !Array.isArray(heights)) return undefined;
	const n = Math.round(Math.sqrt(heights.length));
	if (n < 2 || n * n !== heights.length || Math.abs((n - 1) * spacing - 2 * half) > 1e-6) return undefined;
	if (!heights.every((h) => typeof h === 'number' && Number.isFinite(h))) return undefined;
	const { regions } = v as Record<string, unknown>;
	const known = Array.isArray(regions) ? regions.filter((r): r is TerrainRegion => TERRAIN_REGIONS.includes(r)) : undefined;
	return { spacing, heights, ...(known ? { regions: known } : {}) };
}

export const DEFAULT_PLAN_NAME = 'Existing conditions';

// A plan's choices about the site's pieces. Choices about pieces the site no longer has are
// dropped, as are zones on parts it no longer has: the site can change under its plans.
function parseChoices(v: unknown, path: string, existing: Plan): ExistingChoices {
	const o = obj(v, path);
	const out: ExistingChoices = {};
	for (const [id, raw] of Object.entries(o)) {
		const base = existing.structures.find((s) => s.id === id);
		if (!base) continue;
		const c = obj(raw, `${path}.${id}`);
		const partIds = new Set(base.parts.map((p) => p.id));
		const zones = arr(c.reuseZones ?? [], `${path}.${id}.reuseZones`)
			.filter((z) => partIds.has(String((z as Obj)?.partId)))
			.map((z, i) => parseZone(z, `${path}.${id}.reuseZones[${i}]`, partIds));
		const choice: ExistingChoice = {};
		if (c.removed === true) choice.removed = true;
		const added = optional(c.addedStories, (n) => num(n, `${path}.${id}.addedStories`));
		if (added) choice.addedStories = added;
		const roof = optional(c.roof, (r) => oneOf(r, ROOFS, `${path}.${id}.roof`));
		if (roof) choice.roof = roof;
		if (zones.length) choice.reuseZones = zones;
		if (c.uses !== undefined && !choice.removed) {
			choice.uses = parseUses(c.uses, `${path}.${id}.uses`);
			const weights = parseWeights(c.useWeights, `${path}.${id}.useWeights`);
			if (weights) choice.useWeights = weights;
		}
		if (Object.keys(choice).length) out[id] = choice;
	}
	return out;
}

// Before the site view: existing conditions are the first plan's buildings as they stand, with
// its open spaces and trees, and every plan keeps what it proposed as choices. A first plan
// that is just "Existing conditions", proposing nothing, becomes the site view.
function migrateToSiteView(plans: Plan[]): { existing: Plan; plans: Plan[] } {
	const [first] = plans;
	const asBuilt = (s: Structure): Structure => ({ ...structuredClone(s), status: 'existing', reuseZones: undefined, addedStories: undefined, planRoof: undefined, planUses: undefined, planUseWeights: undefined });
	const existing: Plan = {
		id: `${first.id}-existing`,
		name: DEFAULT_PLAN_NAME,
		slug: '',
		structures: first.structures.filter((s) => s.status !== 'new').map(asBuilt),
		openSpaces: structuredClone(first.openSpaces),
		trees: structuredClone(first.trees),
		annotations: [],
		buildingTypeOverride: first.buildingTypeOverride,
	};
	// An existing building only a later plan has joins the site, so nothing is lost
	const firstIds = new Set(existing.structures.map((s) => s.id));
	const ids = new Set(firstIds);
	for (const p of plans.slice(1)) {
		for (const s of p.structures) {
			if (s.status !== 'new' && !ids.has(s.id)) {
				existing.structures.push(asBuilt(s));
				ids.add(s.id);
			}
		}
	}
	const converted = plans.map((p) => {
		const choices = choicesOf(existing, p);
		// A later plan that had deleted one of the first plan's buildings: it's gone in that plan
		for (const id of firstIds) if (!p.structures.some((s) => s.id === id)) choices[id] = { removed: true };
		const own = p.structures.filter((s) => s.status === 'new');
		return { plan: expandPlan(existing, { ...p, structures: own, existingChoices: choices }), proposes: own.length > 0 || Object.keys(choices).length > 0 };
	});
	const [head, ...rest] = converted;
	if (first.name === DEFAULT_PLAN_NAME) {
		if (!head.proposes && !first.developmentTypeOverride) {
			existing.id = first.id;
			return { existing, plans: rest.map((c) => c.plan) };
		}
		// A proposal under the old default name: existing conditions are the site now, so it's
		// renamed, and its old URL redirects
		head.plan = { ...head.plan, name: 'Plan 1', slug: slugify('Plan 1'), oldSlugs: [...(head.plan.oldSlugs ?? []), head.plan.slug] };
	}
	return { existing, plans: converted.map((c) => c.plan) };
}

export function normalizeSite(raw: unknown): Site {
	const o = obj(raw, 'site');
	const id = str(o.id, 'site.id');
	const context = parseContext(o.context);
	const profile = optional(o.congregationProfile, (p) => obj(p, 'site.congregationProfile'));

	let existing: Plan;
	let plans: Plan[];
	if (o.existing !== undefined) {
		existing = { ...parsePlan(o.existing, 'site.existing'), name: DEFAULT_PLAN_NAME, slug: '', oldSlugs: undefined };
		// The site's pieces are as built: what happens to them is up to each plan
		existing.structures = existing.structures.map((s) => ({ ...s, status: 'existing', reuseZones: undefined, addedStories: undefined, planRoof: undefined, planUses: undefined, planUseWeights: undefined }));
		plans = arr(o.plans ?? [], 'site.plans').map((v, i) => {
			const path = `site.plans[${i}]`;
			const plan = parsePlan(v, path);
			const pv = obj(v, path);
			const choices = pv.existingChoices === undefined ? {} : parseChoices(pv.existingChoices, `${path}.existingChoices`, existing);
			const ids = new Set(existing.structures.map((s) => s.id));
			// A plan's own pieces are new construction
			const own = plan.structures.filter((s) => !ids.has(s.id)).map((s) => ({ ...s, status: 'new' as const, reuseZones: undefined, addedStories: undefined, planRoof: undefined, planUses: undefined, planUseWeights: undefined }));
			return expandPlan(existing, { ...plan, structures: own, existingChoices: choices });
		});
	} else {
		const legacy =
			o.plans === undefined
				? [{ id, name: DEFAULT_PLAN_NAME, slug: slugify(DEFAULT_PLAN_NAME), ...parsePlanContent(o, 'site') }]
				: arr(o.plans, 'site.plans').map((p, i) => parsePlan(p, `site.plans[${i}]`));
		if (legacy.length === 0) fail('site.plans', 'expected at least one plan');
		({ existing, plans } = migrateToSiteView(legacy));
	}
	// Rooftop pieces whose host is missing go back to the ground
	existing.structures = settleRoofHosts(existing.structures);
	plans = plans.map((p) => ({ ...p, structures: settleRoofHosts(p.structures) }));
	const ids = new Set<string>([existing.id]);
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
		existing,
		plans,
	};
	return stripUndefined(site);
}

// JSON round trips drop undefined keys; do the same so saved and loaded sites compare equal.
function stripUndefined<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}
