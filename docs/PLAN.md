# Faith & Home Site Modeler: Development Plan

A drag-and-drop tool inside the interactive pattern book. Congregations compose their property from simple pieces, tag each piece with status and use, and see it as a chipboard study model. The composition then feeds pattern matching alongside the existing culture questionnaire.

## Design principles

1. **Sketch, not rendering.** The model should look like a workshop study model: chipboard, basswood, white foam context. Unfinished on purpose, so people feel invited to change it.
2. **Geometry is the source of truth.** Everything shown is derived from what the user placed. No generated imagery stands in for the design.
3. **Blank grid first, real site second.** The grid works for abstract exercises; the address mode puts the same composition on a real parcel.
4. **Pattern-book vocabulary throughout.** Box, box-plus, cluster, object; urban, suburban, rural; adaptive reuse, new construction. The tool should teach the book's language by using it.

## Vocabulary mapping

| Palette piece | Meaning | Pattern-book link |
|---|---|---|
| Rectangle | A bar or wing | Box; combined pieces make Box-Plus |
| Square | Compact volume (hall, house, cottage) | Cluster when repeated |
| Triangle | Mid-century "object in space" church with no clear front or back | Object |

Building type can be inferred from the composition:

- One structure, one piece: **Box**
- One structure, several joined pieces: **Box-Plus**
- Any structure with a triangle or radial plan: **Object**
- Three or more separate structures: **Cluster**

The user can override the inferred type. Site type (urban, suburban, rural) is asked in grid mode and suggested from location in address mode.

## Data model (TypeScript)

```ts
type Status = 'existing' | 'adaptive_reuse' | 'new' | 'removed';
type Use = 'worship' | 'fellowship' | 'education' | 'office' | 'housing'
         | 'community' | 'daycare' | 'social_services' | 'other';
type Roof = 'flat' | 'gable' | 'object';

interface Part {
  id: string;
  shape: 'rect' | 'square' | 'tri';
  x: number; y: number;          // meters, local site coordinates
  w: number; d: number;          // width, depth in meters
  rotation: number;              // degrees
  storiesOverride?: number;      // e.g. a steeple base or tall nave
}

interface Structure {
  id: string;
  label: string;                 // "Sanctuary", "Sunday school wing"
  status: Status;
  uses: Use[];
  stories: number;
  floorHeight: number;           // meters, default 3.5; nave default 9
  roof: Roof;
  parts: Part[];
  dwellings?: number;            // for housing; auto-estimated, editable
  provenance: 'user' | 'osm' | 'overture';
}

interface OpenSpace {
  id: string;
  kind: 'parking' | 'lawn' | 'courtyard' | 'court' | 'garden' | 'cemetery';
  polygon: [number, number][];
}

interface Site {
  id: string;
  name: string;
  mode: 'grid' | 'address';
  origin?: { lat: number; lng: number };  // address mode only
  parcel?: [number, number][];            // local meters
  siteType?: 'urban' | 'suburban' | 'rural';
  structures: Structure[];
  openSpaces: OpenSpace[];
  context: { footprints: [number, number][][]; roads: [number, number][][] };
  annotations: { n: number; x: number; y: number; text: string }[];
}
```

Store sites as JSON in Railway Postgres (via Drizzle ORM), with the parcel and origin also in PostGIS columns for spatial queries later. The modeler schema is managed by Drizzle migrations alongside Directus content tables in the same database. As of M5 there is one `sites` table holding the Site JSON; PostGIS columns for origin and parcel arrive with address mode in M6.

### Sites and plans (M5.5)

One property can have several plans. The site holds what belongs to the place; each plan holds one proposal for it.

| Site (the property) | Plan (one proposal) |
|---|---|
| name, mode, origin, parcel, siteType | name |
| context (footprints, roads) | structures, openSpaces, trees |
| congregationProfile | annotations |

- Parcel and context come from geocoding once (M6) and are shared by every plan, never copied.
- Existing buildings are copied into each plan, since each plan gives them its own status (keep, adaptive reuse, removed). Metrics are computed per plan.
- A new site starts with one plan, "Existing conditions". Proposals usually start by duplicating it.
- Plans are parallel alternatives. Versions (deliberate snapshots of one plan, such as before a workshop) are an open question; build plans first.

URLs are clean slugs that nest instead of using literal `site/plan` segments. Site slugs are unique across sites and plan slugs within their site; collisions get `-2`. Old slugs are kept so renames redirect. Slugs are guessable, which is acceptable until auth exists.

- `/modeler/grace-church` opens the site's first plan
- `/modeler/grace-church/housing-on-lot` opens a plan
- `/modeler/grace-church/housing-on-lot/v3` would open a saved version, if versions are added
- `.../view` is the read-only form at any level

UI: under the site name, a plan switcher shows the current plan's editable name, with New plan and Duplicate. The toolbar Duplicate copies the current plan within the site; duplicating a whole site moves to the sites list, which shows each site's plans.

Migration: each existing site becomes a site with one plan.

## Platform context

This modeler will be merged into a broader Faith & Home storytelling platform. The full platform stack:

- **SvelteKit** — front-end and server throughout (modeler + storytelling)
- **Railway** — hosting for all services (SvelteKit app, Directus, Postgres)
- **Railway Postgres** with PostGIS — single database instance
- **Drizzle ORM** — manages the modeler schema (sites, saves, users)
- **Directus** — headless CMS for storytelling content (stories, case studies, images); connects to the same Postgres instance; provides the admin UI for non-technical editors

## Architecture

- **One scene, two cameras.** A single three.js scene (via Threlte in SvelteKit) with an orthographic plan camera for editing and a perspective orbit camera for viewing. No separate 2D editor to keep in sync.
- **Editing happens in plan view** on a meter grid: drag from palette, move, rotate, resize, snap to grid and to neighboring edges, multi-select, group into a structure.
- **Address mode base** is drawn from vector data (parcel line, context footprints as white foam blocks, roads as printed lines on the base board). No raster map tiles in the model, which suits the aesthetic and avoids tile caching terms. A MapLibre map is used only in the address picker step.
- **Metrics are pure functions** of the Site object, so they can be tested and reused by pattern matching.

## Chipboard look

- Existing: grey chipboard, laminated edges visible as fine lines at each floor
- Adaptive reuse: chipboard with pattern-book green tint
- New construction: kraft or basswood with pattern-book orange tint
- Removed: dashed outline only (echoes the cover illustration)
- Context: white foam blocks, slightly translucent
- Base board: off-white with printed roads and parcel line
- Trees: felt or lichen spheres
- Lighting: warm key light, soft shadows, ambient occlusion
- Optional paper grain overlay and hand-drawn annotation markers matching the book's numbered orange dots

## Milestones

Each milestone is one Claude Code session or a few. Start each in plan mode, review the plan, then let it build.

**M0. Setup.** Add the `/modeler` route to the existing SvelteKit app, install Threlte and three, add Vitest and Playwright if missing, write CLAUDE.md.

**M1. Plan-view editor.** Palette, drag to place, select, move, rotate (15° steps, Shift for free), resize handles, grid and edge snapping, delete, undo and redo, keyboard shortcuts. Geometry unit tests.

**M2. Structures and properties.** Group parts into structures, properties panel (label, status, uses, stories, roof), status colors in plan view, open-space polygons.

**M3. Chipboard 3D view.** Extrusion per part with floor lines, gable and object roofs, materials and lighting above, plan/axon toggle, PNG export at print resolution. Visual check with Playwright screenshots.

**M4. Metrics and pattern matching.** Footprint area, gross floor area, lot coverage, dwellings estimate, parking lost, green space. Infer building type. Combine with the culture questionnaire from the earlier prototype to suggest the closest pattern and show its page.

**M5. Save and share.** (Done) Persist to Railway Postgres via Drizzle ORM, shareable read-only links, duplicate a site to make scenarios. No auth yet; edit and ownership rules come with the platform work.

**M5.5. Sites and plans.** (Done) Split the Site into site and plans as described above: schema and migration, nested URLs, plan switcher, duplicate plan, plans on the sites list. Do before M6 so parcel and context land at the site level.

**M6. Address mode.** Add PostGIS columns for origin and parcel. Geocode, choose parcel, prefill existing buildings and context. Heights come from data where available, otherwise a default, always marked with provenance and editable. See data notes.

**M7. Workshop features.** Side-by-side plans of one site (existing vs. proposal), numbered annotations in the pattern-book style, presenter mode for large screens.

**M8. Experimental.** Stylized AI sketch renders from depth/edge passes; a splat capture of a real church placed beside chipboard massing. Separate module, off by default.

## Data notes for address mode (verify before M6)

- **Footprints:** Overture Maps buildings and OpenStreetMap. Coverage in Lehigh County is generally good for footprints.
- **Heights:** Sparse in open data. Use `height` or `building:levels` where tagged; otherwise estimate from USGS 3DEP lidar (heavier, server-side job) or ask the user to confirm stories. Recommended: default plus user confirmation, which is also a good participatory moment.
- **Parcels:** Lehigh and Northampton County GIS parcel layers.
- **Geocoding:** a provider whose terms allow storing results (not Google). Low volume makes this inexpensive.
- **Avoid:** Google Photorealistic 3D Tiles for anything other than live display.

## Working with Claude Code

- Keep CLAUDE.md current; it is what each new session reads first.
- One milestone per branch, small commits, review diffs before merging.
- Ask for tests with every geometry or metrics change.
- Name dependencies yourself rather than letting the agent choose.
- For visual work, have it take Playwright screenshots and compare against reference images you provide (pattern-book spreads, photos of real chipboard models).
- Design decisions stay with the team: palette semantics, colors, material references, which metrics appear, pattern-matching weights.
