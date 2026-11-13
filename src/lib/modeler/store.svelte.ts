import type { BuildingType, DevelopmentType, CongregationProfile, OpenSpace, PaletteShape, Part, Plan, ReuseZone, Site, Structure, Terrain, Tree, Use } from './types';
import type { InteractionMode, ResizeHandle } from './interaction';
import { getPartAABB, snapEdge, snapToGrid, type AABB } from './snap';
import { putSite } from './api';
import { terrainModel, type TerrainModel } from './terrain';
import { fetchContext, fetchTerrain, type ContextBuildingData, type ContextResponse, type Suggestion } from './address';
import {
	boardHalfFor,
	buildingsInParcel,
	clipToPart,
	mergeParcels,
	splitPart,
	wholePartZone,
	zoneOutline,
	zonesForPolygon,
	CONTEXT_HALF_SIZE,
	fitFootprint,
	GROUND_HALF,
	pointInPolygon,
	storiesFromTags,
	suggestSiteType,
} from './geo';
import { partFootprint, polygonArea } from './metrics';
import { contentBounds, DEFAULT_VIEW, fitView, panBy, zoomAt, type PlanView } from './view';
import { DEFAULT_PLAN_NAME } from './serialize';
import { assignPlanSlugs } from './slug';

const PART_DEFAULTS: Record<PaletteShape, { w: number; d: number }> = {
	rect: { w: 10, d: 6 },
	circle: { w: 6, d: 6 },
	square: { w: 6, d: 6 },
	tri: { w: 6, d: 6 },
};

const MAX_UNDO = 50;

// A zone's floors kept within the building: 1 to stories, or from 0 with a basement
function clampFloors([from, to]: [number, number], s: Structure): [number, number] {
	const lowest = s.basement ? 0 : 1;
	const f = Math.min(Math.max(from, lowest), s.stories);
	return [f, Math.min(Math.max(to, f), s.stories)];
}

// Deep copy of reactive state. Not $state.snapshot(this.x) alone: server builds (which
// Vitest uses) compile that to the plain value, so "copies" would share arrays.
function copy<T>(value: T): T {
	return structuredClone($state.snapshot(value)) as T;
}

function makePlan(name: string, content: Partial<Plan> = {}): Plan {
	return {
		id: crypto.randomUUID(),
		name,
		slug: '',
		structures: [],
		openSpaces: [],
		trees: [],
		annotations: [],
		...content,
	};
}

function makeSite(): Site {
	const site: Site = {
		id: crypto.randomUUID(),
		name: '',
		mode: 'grid',
		context: { buildings: [], roads: [] },
		plans: [makePlan(DEFAULT_PLAN_NAME)],
	};
	assignPlanSlugs(site);
	return site;
}

class ModelerStore {
	site = $state<Site>(makeSite());
	mode = $state<InteractionMode>({ type: 'idle' });
	activeStructureId = $state<string>('');
	sidebarTab = $state<'spatial' | 'social'>('spatial');
	viewMode = $state<'plan' | '3d'>('plan');
	showLabels = $state(true);
	showAnalysis = $state(false);
	readOnly = $state(false);
	planView = $state<PlanView>(DEFAULT_VIEW); // what plan view shows; never saved
	#planAspect = 0; // canvas width / height, reported by the plan camera
	#fitPending = false;
	#parcelVersion = 0; // bumped on every parcel change, so slow reloads can tell they're stale
	#terrainVersion = 0; // bumped on every terrain request and address change, for the same reason
	terrainState = $state<'idle' | 'loading' | 'failed'>('idle'); // not saved
	// Layers and contours, derived from the stored heights. Address mode only.
	terrain = $derived(
		this.site.mode === 'address' && this.site.context.terrain ? terrainModel(this.site.context.terrain, this.boardHalf) : null,
	);
	// What 3D sets on the terrain; plan view and editing stay flat
	get terrain3D(): TerrainModel | null {
		return this.viewMode === '3d' ? this.terrain : null;
	}
	// Address setup, between picking an address and finishing the parcel. Not saved.
	setup = $state<{
		context: ContextResponse;
		selected: string[]; // parcel ids chosen so far; merged into one parcel on confirm
		notice?: string;
		prefill: ContextBuildingData[] | null;
		growing?: boolean;
		growFailed?: boolean;
	} | null>(null);
	isPersisted = $state(false); // a database row exists for site.id
	siteSlug = $state(''); // URL key, assigned by the server on save
	activePlanId = $state('');
	saveState = $state<'idle' | 'saving' | 'error'>('idle');

	readonly #undoStack: Site[] = [];
	readonly #redoStack: Site[] = [];
	#gestureDidMutate = false;
	#savedJson = $state(JSON.stringify(this.site)); // site as last saved or loaded
	#inflightSave: Promise<boolean> | null = null;

	constructor() {
		this.activeStructureId = '';
	}

	get isDirty(): boolean {
		return JSON.stringify(this.site) !== this.#savedJson;
	}

	// Start a blank, unsaved site (the /modeler route).
	newSite() {
		const site = makeSite();
		this.#reset(site, '', site.plans[0].id, false);
	}

	loadSite(site: Site, siteSlug: string, planId: string, readOnly: boolean) {
		this.#reset(site, siteSlug, planId, readOnly);
	}

	#reset(site: Site, siteSlug: string, planId: string, readOnly: boolean) {
		this.site = site;
		this.setup = null;
		this.#terrainVersion++;
		this.terrainState = 'idle';
		this.planView = DEFAULT_VIEW;
		this.fitPlan();
		this.#savedJson = JSON.stringify(site);
		this.siteSlug = siteSlug;
		this.isPersisted = siteSlug !== '';
		this.readOnly = readOnly;
		this.saveState = 'idle';
		this.showAnalysis = false;
		this.#selectPlan(planId);
	}

	// ── Plans ────────────────────────────────────────────────────────────────

	// The plan being viewed and edited. Falls back to the first plan if the id is stale.
	get plan(): Plan {
		return this.site.plans.find((p) => p.id === this.activePlanId) ?? this.site.plans[0];
	}

	// Plan switches, adds and deletes clear history, so undo never restores a plan that's gone
	#selectPlan(id: string) {
		this.activePlanId = id;
		this.mode = { type: 'idle' };
		this.activeStructureId = '';
		this.#undoStack.splice(0);
		this.#redoStack.splice(0);
	}

	switchPlan(id: string) {
		if (id !== this.plan.id && this.site.plans.some((p) => p.id === id)) this.#selectPlan(id);
	}

	renamePlan(name: string) {
		this.#pushUndo();
		this.plan.name = name;
	}

	#addPlan(plan: Plan) {
		this.site.plans.push(plan);
		assignPlanSlugs(this.site);
		this.#selectPlan(plan.id);
	}

	// A fresh proposal: the buildings as they stand today, without proposed ones.
	newPlan() {
		const current = copy(this.plan);
		const structures = current.structures
			.filter((s) => s.status !== 'new')
			// A fresh proposal starts from the buildings as they stand: nothing reused yet
			.map((s) => ({ ...s, status: 'existing' as const, reuseZones: undefined }));
		this.#addPlan(
			makePlan('New plan', { structures, openSpaces: current.openSpaces, trees: current.trees }),
		);
	}

	duplicatePlan() {
		const current = copy(this.plan);
		this.#addPlan({ ...current, id: crypto.randomUUID(), name: `${current.name} copy`, slug: '', oldSlugs: undefined });
	}

	deletePlan(id: string) {
		if (this.site.plans.length <= 1) return;
		const idx = this.site.plans.findIndex((p) => p.id === id);
		if (idx === -1) return;
		const stayOn = this.plan.id === id ? this.site.plans[idx === 0 ? 1 : idx - 1].id : this.plan.id;
		this.site.plans.splice(idx, 1);
		this.#selectPlan(stayOn);
	}

	// Upserts the site. Edits made while a save is in flight stay dirty.
	save(): Promise<boolean> {
		if (this.readOnly) return Promise.resolve(false);
		this.#inflightSave ??= this.#doSave().finally(() => {
			this.#inflightSave = null;
		});
		return this.#inflightSave;
	}

	async #doSave(): Promise<boolean> {
		assignPlanSlugs(this.site); // renamed plans get new slugs; old ones are kept for redirects
		const json = JSON.stringify($state.snapshot(this.site));
		this.saveState = 'saving';
		try {
			const ref = await putSite(json, this.site.id);
			this.siteSlug = ref.slug;
			this.#savedJson = json;
			this.isPersisted = true;
			this.saveState = 'idle';
			return true;
		} catch (e) {
			console.error(e);
			this.saveState = 'error';
			return false;
		}
	}

	get selectedPartId(): string | null {
		const m = this.mode;
		if (
			m.type === 'selected' ||
			m.type === 'dragging' ||
			m.type === 'resizing' ||
			m.type === 'rotating'
		) {
			return m.partId;
		}
		return null;
	}

	get allParts(): Part[] {
		return this.plan.structures.flatMap((s) => s.parts);
	}

	get selectedPart(): Part | undefined {
		const id = this.selectedPartId;
		return id ? this.allParts.find((p) => p.id === id) : undefined;
	}

	get selectedStructure(): Structure | undefined {
		const id = this.selectedPartId;
		if (!id) return undefined;
		return this.plan.structures.find((s) => s.parts.some((p) => p.id === id));
	}

	get activeStructure(): Structure | undefined {
		return this.plan.structures.find((s) => s.id === this.activeStructureId);
	}

	get selectedOpenSpaceId(): string | null {
		const m = this.mode;
		if (
			m.type === 'selectedOpenSpace' ||
			m.type === 'draggingOpenSpace' ||
			m.type === 'draggingOsVertex'
		) {
			return m.openSpaceId;
		}
		return null;
	}

	get selectedOpenSpace(): OpenSpace | undefined {
		const id = this.selectedOpenSpaceId;
		return id ? this.plan.openSpaces.find((o) => o.id === id) : undefined;
	}

	get selectedTreeId(): string | null {
		const m = this.mode;
		if (m.type === 'selectedTree' || m.type === 'draggingTree') return m.treeId;
		return null;
	}

	#pushUndo() {
		const snapshot = copy(this.site);
		if (this.#undoStack.length >= MAX_UNDO) this.#undoStack.shift();
		this.#undoStack.push(snapshot);
		this.#redoStack.splice(0);
	}

	#mutPart(id: string, fn: (p: Part) => void) {
		for (const s of this.plan.structures) {
			const p = s.parts.find((p) => p.id === id);
			if (p) {
				fn(p);
				return;
			}
		}
	}

	#findPart(id: string): Part | undefined {
		return this.allParts.find((p) => p.id === id);
	}

	// Clone the structure that owns partId, return the corresponding new part's id.
	// No #pushUndo() here — startDragging captures the state including the clone.
	duplicateStructure(partId: string): string | null {
		const srcStructure = this.plan.structures.find((s) => s.parts.some((p) => p.id === partId));
		if (!srcStructure) return null;
		const snapshot = copy(srcStructure);
		const partIndex = snapshot.parts.findIndex((p) => p.id === partId);
		const newParts = snapshot.parts.map((p) => ({ ...p, id: crypto.randomUUID() }));
		const newPartId = new Map(snapshot.parts.map((p, i) => [p.id, newParts[i].id]));
		const newStructure: Structure = {
			...snapshot,
			id: crypto.randomUUID(),
			groupId: undefined, // copies don't inherit group membership
			parts: newParts,
			reuseZones: snapshot.reuseZones?.map((z) => ({ ...z, id: crypto.randomUUID(), partId: newPartId.get(z.partId)! })),
		};
		this.plan.structures.push(newStructure);
		this.activeStructureId = newStructure.id;
		return newParts[partIndex >= 0 ? partIndex : 0].id;
	}

	// ── Reuse zones ──────────────────────────────────────────────────────────

	// Reuse is proposed in existing buildings; housing by default (this is a housing tool)
	#newZones(structure: Structure, areas: { partId: string; points: [number, number][] }[], use: Use = 'housing') {
		structure.reuseZones = [
			...(structure.reuseZones ?? []),
			...areas.map((a) => ({ id: crypto.randomUUID(), ...a, floors: [1, structure.stories] as [number, number], use })),
		];
	}

	addWholeBuildingReuse(structureId: string) {
		const s = this.plan.structures.find((s) => s.id === structureId);
		if (!s || s.status !== 'existing') return;
		this.#pushUndo();
		this.#newZones(s, s.parts.map((p) => ({ partId: p.id, points: wholePartZone(p) })));
	}

	startDrawingZone(structureId: string) {
		this.mode = { type: 'drawingZone', structureId, points: [] };
	}

	addZoneVertex(x: number, y: number) {
		if (this.mode.type !== 'drawingZone') return;
		const { structureId, points } = this.mode;
		if (points.length >= 3 && Math.hypot(x - points[0][0], y - points[0][1]) < 2) {
			this.#finishZone(structureId, points);
			return;
		}
		this.mode = { type: 'drawingZone', structureId, points: [...points, [x, y]], cursorPoint: [x, y] };
	}

	updateZoneCursor(x: number, y: number) {
		if (this.mode.type === 'drawingZone') this.mode = { ...this.mode, cursorPoint: [x, y] };
	}

	#finishZone(structureId: string, outline: [number, number][]) {
		const s = this.plan.structures.find((s) => s.id === structureId);
		const areas = s ? zonesForPolygon(outline, s.parts) : [];
		if (!s || areas.length === 0) {
			this.mode = { type: 'drawingZone', structureId, points: [], missed: true };
			return;
		}
		this.#pushUndo();
		this.#newZones(s, areas);
		this.selectStructure(s.id);
	}

	#findZone(zoneId: string): { s: Structure; z: ReuseZone } | undefined {
		for (const s of this.plan.structures) {
			const z = s.reuseZones?.find((z) => z.id === zoneId);
			if (z) return { s, z };
		}
	}

	updateZone(zoneId: string, patch: Partial<Pick<ReuseZone, 'floors' | 'use' | 'dwellings'>>) {
		const found = this.#findZone(zoneId);
		if (!found) return;
		this.#pushUndo();
		Object.assign(found.z, patch);
		found.z.floors = clampFloors(found.z.floors, found.s);
		if (found.z.use !== 'housing') found.z.dwellings = undefined;
	}

	deleteZone(zoneId: string) {
		const found = this.#findZone(zoneId);
		if (!found) return;
		this.#pushUndo();
		const zones = found.s.reuseZones!.filter((z) => z.id !== zoneId);
		found.s.reuseZones = zones.length ? zones : undefined;
	}

	// ── Cutting ──────────────────────────────────────────────────────────────

	startCutting(structureId: string) {
		this.mode = { type: 'cutting', structureId };
	}

	addCutPoint(x: number, y: number) {
		if (this.mode.type !== 'cutting') return;
		const { structureId, start } = this.mode;
		if (!start) {
			this.mode = { type: 'cutting', structureId, start: [x, y], cursor: [x, y] };
			return;
		}
		const first = this.cutStructure(structureId, start, [x, y]);
		this.mode = first ? { type: 'selected', partId: first } : { type: 'cutting', structureId, missed: true };
	}

	updateCutCursor(x: number, y: number) {
		if (this.mode.type === 'cutting' && this.mode.start) this.mode = { ...this.mode, cursor: [x, y] };
	}

	// Cuts a structure along the line a-b into pieces that stay one building: the largest piece
	// keeps the structure, the others become new structures in the same group, each free to take
	// its own stories, roof, status and uses (additions often differ). Returns the kept part's id,
	// or null if the line misses.
	cutStructure(id: string, a: [number, number], b: [number, number]): string | null {
		const structure = this.plan.structures.find((s) => s.id === id);
		if (!structure) return null;
		const cuts = structure.parts.map((part) => ({ part, pieces: splitPart(part, a, b) }));
		if (!cuts.some((c) => c.pieces)) return null;
		this.#pushUndo();

		// Zones on cut parts, in site coordinates, to re-clip against the pieces below
		const cutPartIds = new Set(cuts.filter((c) => c.pieces).map((c) => c.part.id));
		const movingZones = (structure.reuseZones ?? [])
			.filter((z) => cutPartIds.has(z.partId))
			.map((z) => ({ zone: copy(z), outline: zoneOutline(z, structure.parts.find((p) => p.id === z.partId)!) }));
		const zonesFor = (parts: Part[], keep: ReuseZone[] = []): ReuseZone[] | undefined => {
			const zones = [
				...keep,
				...parts.flatMap((part) =>
					movingZones.flatMap(({ zone, outline }) =>
						clipToPart(outline, part).map((points) => ({ ...zone, id: crypto.randomUUID(), partId: part.id, points })),
					),
				),
			];
			return zones.length ? zones : undefined;
		};
		const keptZones = (structure.reuseZones ?? []).filter((z) => !cutPartIds.has(z.partId));

		const kept = cuts.filter((c) => !c.pieces).map((c) => c.part);
		const pieces: Part[] = cuts
			.flatMap((c) => c.pieces ?? [])
			.map((g) => ({ id: crypto.randomUUID(), ...g }))
			.sort((p, q) => partFootprint(q) - partFootprint(p));
		const [largest, ...rest] = pieces;
		const groupId = structure.groupId ?? crypto.randomUUID();
		// Gables need rectangles; irregular pieces fall back to flat, as the roof menu does
		const roofFor = (parts: Part[]) =>
			structure.roof === 'gable' && parts.some((p) => p.shape !== 'rect' && p.shape !== 'square') ? 'flat' : structure.roof;

		structure.parts = [...kept, largest];
		structure.groupId = groupId;
		structure.reuseZones = zonesFor([largest], keptZones);
		const template = copy(structure);
		structure.roof = roofFor(structure.parts);
		rest.forEach((part, i) => {
			this.plan.structures.push({
				...template,
				id: crypto.randomUUID(),
				label: `${template.label} ${i + 2}`,
				parts: [part],
				roof: roofFor([part]),
				dwellings: undefined, // stays with the original piece
				reuseZones: zonesFor([part]),
			});
		});
		return largest.id;
	}

	splitStructure(id: string) {
		this.#pushUndo();
		const structure = this.plan.structures.find((s) => s.id === id);
		if (!structure || structure.parts.length <= 1) return;
		const snap = copy(structure);
		const zonesOn = (part: Part) => {
			const zones = snap.reuseZones?.filter((z) => z.partId === part.id);
			return zones?.length ? zones : undefined;
		};
		structure.parts = [snap.parts[0]];
		structure.reuseZones = zonesOn(snap.parts[0]);
		for (const part of snap.parts.slice(1)) {
			this.plan.structures.push({ ...snap, id: crypto.randomUUID(), parts: [part], reuseZones: zonesOn(part) });
		}
	}

	placePart(shape: PaletteShape, x: number, y: number) {
		this.#pushUndo();
		const defaults = PART_DEFAULTS[shape];
		const part: Part = {
			id: crypto.randomUUID(),
			shape,
			x: snapToGrid(x),
			y: snapToGrid(y),
			...defaults,
			rotation: 0,
			ridgeAxis: defaults.w >= defaults.d ? 'w' : 'd',
		};
		// Each placed shape gets its own structure entry
		const s: Structure = {
			id: crypto.randomUUID(),
			label: 'Structure',
			status: 'existing',
			uses: [],
			stories: 1,
			floorHeight: 3.5,
			roof: 'flat',
			parts: [part],
			provenance: 'user',
		};
		this.plan.structures.push(s);
		this.activeStructureId = s.id;
		this.mode = { type: 'selected', partId: part.id };
	}

	addStructure() {
		this.#pushUndo();
		const s: Structure = {
			id: crypto.randomUUID(),
			label: 'Structure',
			status: 'existing',
			uses: [],
			stories: 1,
			floorHeight: 3.5,
			roof: 'flat',
			parts: [],
			provenance: 'user',
		};
		this.plan.structures.push(s);
		this.activeStructureId = s.id;
	}

	setActiveStructure(id: string) {
		this.activeStructureId = id;
		this.sidebarTab = 'spatial';
	}

	selectStructure(id: string) {
		this.activeStructureId = id;
		this.sidebarTab = 'spatial';
		const s = this.plan.structures.find((s) => s.id === id);
		if (s && s.parts.length > 0) {
			this.mode = { type: 'selected', partId: s.parts[0].id };
		} else {
			this.mode = { type: 'idle' };
		}
	}

	updateStructure(
		id: string,
		patch: Partial<
			Pick<Structure, 'label' | 'status' | 'uses' | 'stories' | 'floorHeight' | 'roof' | 'useWeights' | 'dwellings' | 'basement'>
		>,
	) {
		this.#pushUndo();
		const s = this.plan.structures.find((s) => s.id === id);
		if (!s) return;
		Object.assign(s, patch);
		// Prefilled heights are marked until someone confirms them by editing
		if (patch.stories !== undefined || patch.floorHeight !== undefined) s.heightSource = undefined;
		// Reuse happens in existing buildings only, and within their floors
		if (s.status !== 'existing') s.reuseZones = undefined;
		if (s.reuseZones) s.reuseZones = s.reuseZones.map((z) => ({ ...z, floors: clampFloors(z.floors, s) }));
	}

	deleteStructure(id: string) {
		this.#pushUndo();
		const idx = this.plan.structures.findIndex((s) => s.id === id);
		if (idx === -1) return;
		const groupId = this.plan.structures[idx].groupId;
		this.plan.structures.splice(idx, 1);
		// If only one structure remains in the group, remove its orphaned groupId
		if (groupId) {
			const remaining = this.plan.structures.filter((s) => s.groupId === groupId);
			if (remaining.length === 1) remaining[0].groupId = undefined;
		}
		if (this.activeStructureId === id) {
			this.activeStructureId = this.plan.structures[0]?.id ?? '';
		}
		this.mode = { type: 'idle' };
	}

	selectOpenSpace(id: string | null) {
		this.mode = id ? { type: 'selectedOpenSpace', openSpaceId: id } : { type: 'idle' };
	}

	updateOpenSpace(id: string, patch: Partial<Pick<OpenSpace, 'label' | 'kind'>>) {
		this.#pushUndo();
		const os = this.plan.openSpaces.find((o) => o.id === id);
		if (!os) return;
		Object.assign(os, patch);
	}

	startDraggingOpenSpace(id: string, anchorX: number, anchorY: number) {
		const os = this.plan.openSpaces.find((o) => o.id === id);
		if (!os) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		this.mode = {
			type: 'draggingOpenSpace',
			openSpaceId: id,
			origPolygon: os.polygon.map((p) => [p[0], p[1]] as [number, number]),
			anchorX,
			anchorY,
		};
	}

	updateDragOpenSpace(x: number, y: number) {
		if (this.mode.type !== 'draggingOpenSpace') return;
		const { openSpaceId, origPolygon, anchorX, anchorY } = this.mode;
		const dx = x - anchorX;
		const dy = y - anchorY;
		const os = this.plan.openSpaces.find((o) => o.id === openSpaceId);
		if (!os) return;
		os.polygon = origPolygon.map((p) => [p[0] + dx, p[1] + dy]);
		this.#gestureDidMutate = true;
	}

	endDragOpenSpace() {
		if (this.mode.type !== 'draggingOpenSpace') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selectedOpenSpace', openSpaceId: this.mode.openSpaceId };
	}

	startDraggingOsVertex(id: string, vertexIndex: number) {
		const os = this.plan.openSpaces.find((o) => o.id === id);
		if (!os) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		this.mode = {
			type: 'draggingOsVertex',
			openSpaceId: id,
			vertexIndex,
			origPolygon: os.polygon.map((p) => [p[0], p[1]] as [number, number]),
		};
	}

	updateDragOsVertex(x: number, y: number) {
		if (this.mode.type !== 'draggingOsVertex') return;
		const { openSpaceId, vertexIndex, origPolygon } = this.mode;
		const os = this.plan.openSpaces.find((o) => o.id === openSpaceId);
		if (!os) return;
		os.polygon = origPolygon.map((p, i) =>
			i === vertexIndex ? ([x, y] as [number, number]) : ([p[0], p[1]] as [number, number]),
		);
		this.#gestureDidMutate = true;
	}

	endDragOsVertex() {
		if (this.mode.type !== 'draggingOsVertex') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selectedOpenSpace', openSpaceId: this.mode.openSpaceId };
	}

	startDrawingOpenSpace(kind: OpenSpace['kind']) {
		this.mode = { type: 'drawingOpenSpace', kind, points: [] };
	}

	addOpenSpaceVertex(x: number, y: number): boolean {
		if (this.mode.type !== 'drawingOpenSpace') return false;
		const { kind, points } = this.mode;
		const CLOSE_DIST = 2;
		if (
			points.length >= 3 &&
			Math.hypot(x - points[0][0], y - points[0][1]) < CLOSE_DIST
		) {
			this.addOpenSpace(kind, points);
			return true;
		}
		this.mode = { type: 'drawingOpenSpace', kind, points: [...points, [x, y]], cursorPoint: [x, y] };
		return false;
	}

	updateOpenSpaceCursor(x: number, y: number) {
		if (this.mode.type !== 'drawingOpenSpace') return;
		this.mode = { ...this.mode, cursorPoint: [x, y] };
	}

	addOpenSpace(kind: OpenSpace['kind'], points: [number, number][]) {
		this.#pushUndo();
		const os: OpenSpace = {
			id: crypto.randomUUID(),
			kind,
			polygon: points,
		};
		this.plan.openSpaces.push(os);
		this.mode = { type: 'idle' };
	}

	deleteOpenSpace(id: string) {
		this.#pushUndo();
		const idx = this.plan.openSpaces.findIndex((o) => o.id === id);
		if (idx !== -1) this.plan.openSpaces.splice(idx, 1);
	}

	selectPart(id: string | null) {
		this.mode = id ? { type: 'selected', partId: id } : { type: 'idle' };
	}

	startDragging(id: string, offsetX: number, offsetY: number, cloning = false) {
		this.#pushUndo();
		this.#gestureDidMutate = false;
		const structure = this.plan.structures.find((s) => s.parts.some((p) => p.id === id));
		// Include all parts from every structure in the same group so they move as a unit
		const groupMembers =
			structure?.groupId
				? this.plan.structures.filter((s) => s.groupId === structure.groupId)
				: structure
					? [structure]
					: [];
		const companions = groupMembers.flatMap((s) =>
			s.parts.map((p) => ({ id: p.id, initialX: p.x, initialY: p.y })),
		);
		this.mode = { type: 'dragging', partId: id, offsetX, offsetY, companions, cloning };
	}

	updateDrag(worldX: number, worldY: number) {
		if (this.mode.type !== 'dragging') return;
		const { partId, offsetX, offsetY, companions } = this.mode;
		const rawX = worldX - offsetX;
		const rawY = worldY - offsetY;
		const primary = this.#findPart(partId);
		if (!primary) return;
		const gridX = snapToGrid(rawX);
		const gridY = snapToGrid(rawY);
		// Exclude all parts of the dragged structure from snap targets
		const companionIds = new Set(companions.map((c) => c.id));
		const others = this.allParts.filter((p) => !companionIds.has(p.id));
		const snapped = snapEdge({ ...primary, x: gridX, y: gridY }, others);
		// Apply snap delta (edge-snap adjustment) to all companions
		const sdX = snapped.x - gridX;
		const sdY = snapped.y - gridY;
		this.#mutPart(partId, (p) => {
			p.x = snapped.x;
			p.y = snapped.y;
		});
		const primaryInit = companions.find((c) => c.id === partId)!;
		for (const comp of companions) {
			if (comp.id === partId) continue;
			const diffX = comp.initialX - primaryInit.initialX;
			const diffY = comp.initialY - primaryInit.initialY;
			this.#mutPart(comp.id, (p) => {
				p.x = snapToGrid(rawX + diffX) + sdX;
				p.y = snapToGrid(rawY + diffY) + sdY;
			});
		}
		this.#gestureDidMutate = true;
	}

	endDrag() {
		if (this.mode.type !== 'dragging') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		const { partId, cloning } = this.mode;
		// Auto-group when dropped touching another structure (not while cloning)
		if (!cloning) {
			const draggedStructure = this.plan.structures.find((s) =>
				s.parts.some((p) => p.id === partId),
			);
			if (draggedStructure) {
				const target = this.#findTouchingStructure(draggedStructure);
				if (target) this.#groupStructures(draggedStructure.id, target.id);
			}
		}
		this.mode = { type: 'selected', partId };
	}

	#aabbsTouch(a: AABB, b: AABB): boolean {
		const e = 0.01;
		return (
			a.maxX + e >= b.minX &&
			a.minX - e <= b.maxX &&
			a.maxY + e >= b.minY &&
			a.minY - e <= b.maxY
		);
	}

	#findTouchingStructure(draggedStructure: Structure): Structure | undefined {
		const draggedAABBs = draggedStructure.parts.map((p) => getPartAABB(p));
		for (const other of this.plan.structures) {
			if (other.id === draggedStructure.id) continue;
			for (const otherPart of other.parts) {
				const otherAABB = getPartAABB(otherPart);
				for (const draggedAABB of draggedAABBs) {
					if (this.#aabbsTouch(draggedAABB, otherAABB)) return other;
				}
			}
		}
		return undefined;
	}

	#groupStructures(id1: string, id2: string) {
		const s1 = this.plan.structures.find((s) => s.id === id1);
		const s2 = this.plan.structures.find((s) => s.id === id2);
		if (!s1 || !s2) return;
		if (s1.groupId !== undefined && s1.groupId === s2.groupId) return;
		const groupId = s1.groupId ?? s2.groupId ?? crypto.randomUUID();
		s1.groupId = groupId;
		s2.groupId = groupId;
	}

	ungroupStructure(id: string) {
		this.#pushUndo();
		const structure = this.plan.structures.find((s) => s.id === id);
		if (!structure?.groupId) return;
		const groupId = structure.groupId;
		structure.groupId = undefined;
		// If only one member remains in the group, remove its groupId too
		const remaining = this.plan.structures.filter((s) => s.groupId === groupId);
		if (remaining.length === 1) remaining[0].groupId = undefined;
	}

	startResizing(id: string, handle: ResizeHandle) {
		const part = this.#findPart(id);
		if (!part) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		// anchor = corner opposite the dragged handle, rotated to world space
		const adx = handle.includes('e') ? -part.w / 2 : part.w / 2;
		const ady = handle.includes('n') ? -part.d / 2 : part.d / 2;
		const θ = (part.rotation * Math.PI) / 180;
		const c = Math.cos(θ), s = Math.sin(θ);
		const anchorX = part.x + adx * c - ady * s;
		const anchorY = part.y + adx * s + ady * c;
		this.mode = { type: 'resizing', partId: id, handle, anchorX, anchorY, initialW: part.w, initialD: part.d };
	}

	updateResize(worldX: number, worldY: number, proportional = false) {
		if (this.mode.type !== 'resizing') return;
		const { partId, anchorX, anchorY, initialW, initialD } = this.mode;
		const part = this.#findPart(partId);
		if (!part) return;
		const θ = (part.rotation * Math.PI) / 180;
		const c = Math.cos(θ), s = Math.sin(θ);
		// Project cursor-to-anchor vector onto part's local axes
		const vecX = worldX - anchorX;
		const vecY = worldY - anchorY;
		const localX = vecX * c + vecY * s;   // component along local X (width axis)
		const localY = -vecX * s + vecY * c;  // component along local Y (depth axis)
		const rawW = Math.abs(localX);
		const rawD = Math.abs(localY);
		let newW: number, newD: number;
		if (proportional && (rawW > 0 || rawD > 0)) {
			const scale = Math.max(rawW / initialW, rawD / initialD);
			newW = Math.max(1, snapToGrid(initialW * scale, 0.5));
			newD = Math.max(1, snapToGrid(initialD * scale, 0.5));
		} else {
			newW = Math.max(1, snapToGrid(rawW, 0.5));
			newD = Math.max(1, snapToGrid(rawD, 0.5));
		}
		// Reconstruct dragged corner in world space, then center is the midpoint
		const signLX = localX >= 0 ? 1 : -1;
		const signLY = localY >= 0 ? 1 : -1;
		const dragRelX = signLX * newW * c - signLY * newD * s;
		const dragRelY = signLX * newW * s + signLY * newD * c;
		const newX = anchorX + dragRelX / 2;
		const newY = anchorY + dragRelY / 2;
		this.#mutPart(partId, (p) => {
			if (p.shape === 'circle') { newW = newD = Math.max(newW, newD); }
			p.w = newW;
			p.d = newD;
			p.x = newX;
			p.y = newY;
		});
		this.#gestureDidMutate = true;
	}

	endResize() {
		if (this.mode.type !== 'resizing') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	startRotating(id: string, mouseX: number, mouseY: number) {
		const part = this.#findPart(id);
		if (!part) return;
		this.#pushUndo();
		this.#gestureDidMutate = false;
		const startAngle = Math.atan2(mouseY - part.y, mouseX - part.x) * (180 / Math.PI);
		this.mode = {
			type: 'rotating',
			partId: id,
			centerX: part.x,
			centerY: part.y,
			startAngle,
			startRotation: part.rotation,
		};
	}

	updateRotation(mouseX: number, mouseY: number, free: boolean) {
		if (this.mode.type !== 'rotating') return;
		const { partId, centerX, centerY, startAngle, startRotation } = this.mode;
		const angle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
		let delta = angle - startAngle;
		if (!free) delta = Math.round(delta / 15) * 15;
		this.#mutPart(partId, (p) => {
			p.rotation = ((startRotation + delta) % 360 + 360) % 360;
		});
		this.#gestureDidMutate = true;
	}

	endRotation() {
		if (this.mode.type !== 'rotating') return;
		if (!this.#gestureDidMutate) this.#undoStack.pop();
		this.mode = { type: 'selected', partId: this.mode.partId };
	}

	rotatePart(id: string, delta: number) {
		this.#pushUndo();
		this.#mutPart(id, (p) => {
			p.rotation = ((p.rotation + delta) % 360 + 360) % 360;
		});
	}

	deletePart(id: string) {
		// Delete the entire structure that owns this part (1 part = 1 structure)
		const owner = this.plan.structures.find((s) => s.parts.some((p) => p.id === id));
		if (owner) {
			this.#pushUndo();
			const wasActive = this.activeStructureId === owner.id;
			this.plan.structures.splice(this.plan.structures.indexOf(owner), 1);
			if (wasActive) this.activeStructureId = this.plan.structures[0]?.id ?? '';
		}
		this.mode = { type: 'idle' };
	}

	updateGhostPos(shape: Part['shape'], ghostX: number, ghostY: number) {
		this.mode = { type: 'placing', shape, ghostX, ghostY };
	}

	cancelPlacing() {
		this.mode = { type: 'idle' };
	}

	toggleViewMode() {
		this.viewMode = this.viewMode === 'plan' ? '3d' : 'plan';
	}

	// ── Address mode ─────────────────────────────────────────────────────────

	// Suggested from how built-up the neighborhood is; derived, never stored
	get suggestedSiteType(): Site['siteType'] {
		return this.site.mode === 'address' ? suggestSiteType(this.site.context.buildings) : undefined;
	}

	// The current plan's building type: undefined goes back to the inferred one
	setBuildingTypeOverride(type: BuildingType | undefined) {
		this.#pushUndo();
		this.plan.buildingTypeOverride = type;
	}

	// The current plan's development type: undefined goes back to the inferred one
	setDevelopmentTypeOverride(type: DevelopmentType | undefined) {
		this.#pushUndo();
		this.plan.developmentTypeOverride = type;
	}

	setMainBuildingFront(front: Site['mainBuildingFront']) {
		this.#pushUndo();
		this.site.mainBuildingFront = front;
	}

	setSiteType(siteType: Site['siteType']) {
		this.#pushUndo();
		this.site.siteType = siteType;
	}

	// Puts the site at a real address. Its geometry stays where it is relative to the new origin.
	startAddress(place: Suggestion, context: ContextResponse) {
		this.#pushUndo();
		this.site.mode = 'address';
		this.site.address = place.label;
		this.site.origin = { lat: place.lat, lng: place.lng };
		this.site.parcel = undefined;
		this.site.context = {
			buildings: context.buildings.map((b) => ({ polygon: b.polygon, height: b.height })),
			roads: context.roads,
			sources: context.sources,
			buildingSources: context.buildingSources,
		};
		this.site.siteType ??= this.suggestedSiteType;
		void this.loadTerrain();
		this.setup = { context, selected: [], prefill: null };
		// The parcel under the address is the likely one: preselect it to confirm or change
		const underAddress = this.parcelAt(0, 0);
		if (underAddress) this.setup.selected = [underAddress];
		this.planView = { center: [0, 0], height: 220 }; // parcels around the address need room
		this.mode = context.parcels.length ? { type: 'choosingParcel' } : { type: 'drawingParcel', points: [] };
	}

	// The smallest parcel under a point (parcels can nest, like condo lots inside a block)
	parcelAt(x: number, y: number): string | undefined {
		const hits = (this.setup?.context.parcels ?? []).filter((p) => pointInPolygon([x, y], p.polygon));
		hits.sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon));
		return hits[0]?.id;
	}

	hoverParcel(id: string | undefined) {
		if (this.mode.type === 'choosingParcel' && this.mode.hoverId !== id) this.mode = { type: 'choosingParcel', hoverId: id };
	}

	// Adds or removes a lot. Churches often own neighboring lots (a parking lot, a rectory),
	// so a property can be several parcels, as long as they touch.
	toggleParcel(id: string) {
		if (!this.setup) return;
		const { selected } = this.setup;
		if (selected.includes(id)) {
			this.setup = { ...this.setup, selected: selected.filter((s) => s !== id), notice: undefined };
			return;
		}
		const next = [...selected, id];
		const touching = mergeParcels(this.#parcelPolygons(next)) !== null;
		this.setup = touching
			? { ...this.setup, selected: next, notice: undefined }
			: { ...this.setup, notice: 'That lot does not touch your parcel.' };
	}

	confirmParcels() {
		const merged = this.setup && mergeParcels(this.#parcelPolygons(this.setup.selected));
		if (merged) this.#setParcel(merged);
	}

	#parcelPolygons(ids: string[]): [number, number][][] {
		const parcels = this.setup?.context.parcels ?? [];
		return ids
			.map((id) => parcels.find((p) => p.id === id)?.polygon)
			.filter((p): p is [number, number][] => p !== undefined);
	}

	startDrawingParcel() {
		this.mode = { type: 'drawingParcel', points: [] };
	}

	addParcelVertex(x: number, y: number) {
		if (this.mode.type !== 'drawingParcel') return;
		const { points } = this.mode;
		if (points.length >= 3 && Math.hypot(x - points[0][0], y - points[0][1]) < 2) {
			this.#setParcel(points);
			return;
		}
		this.mode = { type: 'drawingParcel', points: [...points, [x, y]], cursorPoint: [x, y] };
	}

	updateParcelCursor(x: number, y: number) {
		if (this.mode.type === 'drawingParcel') this.mode = { ...this.mode, cursorPoint: [x, y] };
	}

	// Ground elevation for the board, fetched apart from the neighborhood so setup never waits on
	// it. Context, like the neighborhood: no undo step. Outside the US the board stays flat.
	async loadTerrain() {
		const origin = this.site.origin;
		if (this.site.mode !== 'address' || !origin) return;
		const version = ++this.#terrainVersion;
		const half = this.boardHalf;
		this.terrainState = 'loading';
		let terrain: Terrain | null = null;
		try {
			terrain = await fetchTerrain(origin.lat, origin.lng, half);
		} catch (e) {
			console.error('could not load terrain', e);
		}
		if (version !== this.#terrainVersion || half !== this.boardHalf) return; // the board changed while loading
		if (terrain) this.site.context.terrain = terrain;
		this.terrainState = terrain ? 'idle' : 'failed';
	}

	// Half the board's width: it bounds pan and zoom, and in address mode the context
	get boardHalf(): number {
		return this.site.mode === 'address' ? (this.site.context.halfSize ?? CONTEXT_HALF_SIZE) : GROUND_HALF;
	}

	#setParcel(polygon: [number, number][]) {
		this.#pushUndo();
		this.site.parcel = polygon;
		this.mode = { type: 'idle' };
		this.fitPlan();
		const version = ++this.#parcelVersion;
		void this.#growBoardFor(polygon, version).then(() => this.#offerPrefill(polygon, version));
	}

	// A parcel near the board's edge (a big rural lot) gets a bigger board: the neighborhood is
	// reloaded once at a size that fits it. If that fails, the current board is kept.
	async #growBoardFor(parcel: [number, number][], version: number) {
		const half = boardHalfFor(parcel, this.boardHalf);
		const origin = this.site.origin;
		if (!half || !origin) return;
		if (this.setup) this.setup = { ...this.setup, growing: true };
		try {
			const context = await fetchContext(origin.lat, origin.lng, half);
			if (version !== this.#parcelVersion) return; // the parcel changed while loading
			this.site.context = {
				buildings: context.buildings.map((b) => ({ polygon: b.polygon, height: b.height })),
				roads: context.roads,
				sources: this.site.context.sources, // parcel credit stays with the original fetch
				buildingSources: context.buildingSources,
				halfSize: half,
			};
			void this.loadTerrain(); // the bigger board needs its own
			if (this.setup) this.setup = { ...this.setup, context: { ...context, parcels: this.setup.context.parcels } };
			this.fitPlan();
		} catch (e) {
			console.error('could not grow the board', e);
			if (this.setup) this.setup = { ...this.setup, growFailed: true };
		} finally {
			if (this.setup) this.setup = { ...this.setup, growing: false };
		}
	}

	#offerPrefill(parcel: [number, number][], version: number) {
		if (!this.setup || version !== this.#parcelVersion) return;
		const onParcel = buildingsInParcel(this.setup.context.buildings, parcel);
		if (onParcel.length) this.setup = { ...this.setup, prefill: onParcel };
		else this.setup = null;
	}

	// Leaves setup without a parcel (it can be drawn later from the address panel)
	finishSetup() {
		this.setup = null;
		this.mode = { type: 'idle' };
		this.fitPlan();
	}

	// Adds the parcel's buildings to the current plan as existing structures. They leave the
	// foam context, since the model now has them as chipboard.
	prefillBuildings() {
		const prefill = this.setup?.prefill;
		if (!prefill) return;
		this.#pushUndo();
		const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
		for (const b of prefill) {
			const { stories, floorHeight, source } = storiesFromTags(b.tags);
			const kind = b.tags.building;
			this.plan.structures.push({
				id: crypto.randomUUID(),
				label: b.name ?? (kind && kind !== 'yes' ? titleCase(kind) : 'Structure'),
				status: 'existing',
				uses: [],
				stories,
				floorHeight,
				roof: 'flat',
				parts: [{ id: crypto.randomUUID(), ...fitFootprint(b.polygon) }],
				provenance: 'overture',
				heightSource: source,
			});
		}
		const added = new Set(prefill.map((b) => JSON.stringify(b.polygon)));
		this.site.context.buildings = this.site.context.buildings.filter((b) => !added.has(JSON.stringify(b.polygon)));
		this.setup = null;
	}

	clearAddress() {
		this.#pushUndo();
		this.site.mode = 'grid';
		this.site.address = undefined;
		this.site.origin = undefined;
		this.site.parcel = undefined;
		this.site.context = { buildings: [], roads: [] };
		this.#parcelVersion++;
		this.#terrainVersion++;
		this.terrainState = 'idle';
		this.finishSetup();
	}

	// ── Plan view ────────────────────────────────────────────────────────────

	// Frames the parcel and the plan's content. Waits for the canvas size if it isn't known yet.
	fitPlan() {
		if (!this.#planAspect) {
			this.#fitPending = true;
			return;
		}
		this.#fitPending = false;
		this.planView = fitView(contentBounds(this.plan, this.site.parcel), this.#planAspect, this.boardHalf);
	}

	setPlanAspect(aspect: number) {
		this.#planAspect = aspect;
		if (this.#fitPending) this.fitPlan();
	}

	// Zooms around a site point (the cursor), or the view center
	zoomPlan(factor: number, at: [number, number] = this.planView.center) {
		this.planView = zoomAt(this.planView, factor, at, this.boardHalf);
	}

	panPlan(dx: number, dy: number, canvasHeight: number) {
		this.planView = panBy(this.planView, dx, dy, canvasHeight, this.boardHalf);
	}

	updateSiteName(name: string) {
		this.#pushUndo();
		this.site.name = name;
	}

	startPlacingTree() {
		this.mode = { type: 'placingTree' };
	}

	placeTree(x: number, y: number) {
		this.#pushUndo();
		const tree: Tree = { id: crypto.randomUUID(), x, y, radius: 2.5, height: 8 };
		this.plan.trees.push(tree);
		this.mode = { type: 'selectedTree', treeId: tree.id };
	}

	selectTree(id: string | null) {
		this.mode = id ? { type: 'selectedTree', treeId: id } : { type: 'idle' };
	}

	deleteTree(id: string) {
		this.#pushUndo();
		const idx = this.plan.trees.findIndex((t) => t.id === id);
		if (idx !== -1) this.plan.trees.splice(idx, 1);
		this.mode = { type: 'idle' };
	}

	startDraggingTree(id: string, offsetX: number, offsetY: number) {
		this.#gestureDidMutate = false;
		this.mode = { type: 'draggingTree', treeId: id, offsetX, offsetY };
	}

	updateDragTree(x: number, y: number) {
		if (this.mode.type !== 'draggingTree') return;
		if (!this.#gestureDidMutate) { this.#pushUndo(); this.#gestureDidMutate = true; }
		const tree = this.plan.trees.find((t) => t.id === (this.mode as { treeId: string }).treeId);
		if (!tree) return;
		tree.x = x - this.mode.offsetX;
		tree.y = y - this.mode.offsetY;
	}

	endDragTree() {
		if (this.mode.type !== 'draggingTree') return;
		this.mode = { type: 'selectedTree', treeId: this.mode.treeId };
		this.#gestureDidMutate = false;
	}

	updateTree(id: string, patch: Partial<Pick<Tree, 'radius' | 'height'>>) {
		this.#pushUndo();
		const tree = this.plan.trees.find((t) => t.id === id);
		if (tree) Object.assign(tree, patch);
	}

	updateCongregationProfile(patch: Partial<CongregationProfile>) {
		this.#pushUndo();
		this.site.congregationProfile = { ...this.site.congregationProfile, ...patch };
	}

	undo() {
		if (this.readOnly || this.#undoStack.length === 0) return;
		const current = copy(this.site);
		this.#redoStack.push(current);
		const prev = this.#undoStack.pop()!;
		this.site = prev;
		this.mode = { type: 'idle' };
	}

	redo() {
		if (this.readOnly || this.#redoStack.length === 0) return;
		const current = copy(this.site);
		this.#undoStack.push(current);
		const next = this.#redoStack.pop()!;
		this.site = next;
		this.mode = { type: 'idle' };
	}
}

export const store = new ModelerStore();
