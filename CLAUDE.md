# CLAUDE.md: Faith & Home Site Modeler

## Project
Interactive site modeler for the Faith & Home pattern book (Small Cities Lab, Lehigh University). Users compose church properties from simple pieces and see a chipboard-style study model. Full plan: docs/PLAN.md.

## Stack
- SvelteKit 3 (Svelte 5), TypeScript strict, adapter-node for Railway
- Threlte + three.js for the scene
- Railway Postgres with PostGIS, Drizzle ORM
- Directus (headless CMS, same Postgres instance, Railway service)
- Vitest for unit tests, Playwright for UI and screenshot tests

## Rules
- Site geometry is in meters in local coordinates; convert to lat/lng only at the edges (geocoding, saving origin).
- The `Site` object in `src/lib/modeler/types.ts` is the single source of truth. A site is the property (name, parcel, context, congregation profile) and holds its `plans`; each `Plan` holds structures, open spaces, trees and annotations. Rendering and metrics are derived from them; never store derived values.
- The store edits one plan at a time: use `store.plan`, not `store.site`, for plan-level fields. Plan-only metrics take a `Plan`; metrics that need the parcel or site type take `(plan, site)`.
- Copy reactive state with the store's `copy()`, not `$state.snapshot(this.x)` alone: server builds (Vitest) compile that to the live value.
- Metrics and building-type inference are pure functions in `src/lib/modeler/metrics.ts` with tests.
- Status is what physically stands: Existing, New, Removed. Adaptive reuse is not a status: it is a `ReuseZone` on an existing structure (an area stored normalized to its part, a floor range, a proposed use). Zones count toward their use and are carved out of the structure's slider program (its current use). Old saves with the Reuse status convert to Existing plus a whole-building zone in `normalizeSite`.
- A building is a set of touching pieces: structures in the same group, or footprints within 0.5 m. Each placed or cut piece is its own structure; joined pieces share a `groupId`. Inference (`inferBuildingType`): 3+ buildings near each other is a Cluster; otherwise the main building decides: Object if the site's front question (`site.mainBuildingFront`) says it has no clear front or several, or if it has a triangle or circle piece; several pieces: Box-Plus; one piece: Box. A cluster stays a cluster whatever its main building is. Thresholds are team-tunable constants; `Plan.buildingTypeOverride` holds the user's choice.
- One three.js scene with two cameras (orthographic plan, perspective orbit). Do not build a separate 2D editor.
- Plan view framing (pan, zoom, fit) is `store.planView`, with pure math in `src/lib/modeler/view.ts`. It is view state: never saved in the Site. Threlte renders on demand, so code that changes a camera by hand must call `invalidate()`.
- No Google Maps or Google 3D Tiles. No raster map tiles inside the 3D model.
- Do not add dependencies without asking.
- Aesthetic is a physical study model (chipboard, basswood, white foam). Never aim for photorealism.
- Import app code with `#lib/...`. Env vars are declared in `src/env.ts` and read from `$app/env/private` (SvelteKit 3; not `$env/...`).
- Use pattern-book vocabulary in UI copy: box, box-plus, cluster, object; urban, suburban, rural; adaptive reuse, new construction.
- UI copy: concise, no em dashes.

## Patterns
- A site sits in one cell of the pattern matrix: building type × site type × development type (4 × 3 × 5 = 60 cells). Development type is per plan (`inferDevelopmentType` in metrics.ts, `Plan.developmentTypeOverride`): Existing conditions, Adaptive reuse, New development, Reuse + new, Downsize / sell.
- The catalog lives in `src/lib/patterns/catalog.ts`. Each pattern covers a set of cells (`cells`); no cell belongs to two patterns (enforced in `catalog.spec.ts`). Social conditions don't add an axis: they pick a `Variant` within a pattern, the first whose every condition is answered and allowed. The patterns are placeholders (`placeholder: true`) for the team to replace; which cells and variants they cover are team decisions. `getPatterns()` is the one place a future Directus fetch goes.
- Matching is pure (`src/lib/patterns/match.ts`): `siteCell`, `patternForCell`, `nearestPattern` (fewest differing axes; ties keep development type, then building type, then site type), `selectVariant`, `coverage`. Tested in `match.spec.ts`.
- The analysis always names the cell ("Urban · Box-Plus · Adaptive reuse"). Covered: the pattern and its variant. Not covered: "No pattern written for this combination yet" plus the closest written pattern and what differs. `/patterns/matrix` shows coverage; pattern pages show their cells (`MatrixGrid.svelte`).
- The four culture questions in the Social tab (partnering, capacity, change, role) are drafts for team review.

## Persistence
- One `sites` table (`src/lib/server/db/schema.ts`): the full `Site` as JSON in `data`, plus `name` for listing. Server helpers in `src/lib/server/sites.ts`.
- Every read and write passes through `normalizeSite` (`src/lib/modeler/serialize.ts`). When adding a field to `Site`, update it there with a default so older saves still load.
- Schema changes: edit `schema.ts`, then `npm run db:generate` and `npm run db:migrate` (reads `DATABASE_URL` from `.env`).
- URLs are `/modeler/<site>/<plan>[/view]` (`src/lib/modeler/slug.ts`); `/modeler/<site>` opens the first plan. Site slugs are unique across sites (`site_slugs` table, assigned by the server); plan slugs are unique within a site (stored in the plan, assigned by `assignPlanSlugs` on save). Collisions get `-2`, `-3`. Old slugs are kept, so renames redirect. Reserved: site `sites`, `new`, `view`; plan `view`. The API (`/api/sites/[id]`) uses the uuid.
- Plan switches and renames update the URL with a shallow `goto` (`syncUrl` in `SiteBar.svelte`), so unsaved edits survive.
- No auth yet, and slugs are guessable: anyone with the editor URL can edit; `.../view` is the read-only share link. `store.readOnly` gates editing.
- Playwright tests write to the `.env` database and delete the rows they create. Mutating API calls from Playwright's `request` need an `origin` header or SvelteKit returns 403.

## Address mode
- Address data is fetched once at setup (`/api/context`) and saved into the Site: `context` (foam buildings, roads, sources), `origin`, `parcel`. Nothing re-fetches on load.
- Sources, terms, attribution and upkeep are in docs/DATA_SOURCES.md; update it when a source is added, dropped or bumped. Prefer global sources; parcels are a per-county registry with drawing as the fallback.
- Pure geometry is in `src/lib/modeler/geo.ts` (projection, footprint fitting, heights from tags, site type). Site coordinates: x east, y south (north is up in plan view).
- Real footprints become `rect` parts when nearly rectangular, otherwise `poly` parts with points normalized to w×d.
- The board is a square around the origin, half-width `context.halfSize` (150 m default). A parcel within 30 m of the edge reloads the context on a bigger board (`boardHalfFor` in geo.ts, max 400 m). Pan and zoom are limited to the board (`store.boardHalf`; grid mode uses the 400 m ground).
- Credit data wherever it appears: the map's credits button, the analysis line and PNG exports, all from `src/lib/modeler/credits.ts`, which credits only the sources a site uses (`context.sources`, `context.buildingSources`, `context.terrain`). A new source needs a credit there.
- Terrain: `context.terrain` is a 5 m elevation grid from the AWS Terrain Tiles (global, 2017; `terrain.regions` drives the national credits), fetched by `/api/terrain` apart from `/api/context` so setup never waits on it; older sites get "Add terrain". The surface, contours and draping are derived in `src/lib/modeler/terrain.ts`, never stored: `store.terrain` is the natural surface (the origin's ground is y = 0), `store.ground` its 3D mesh. The ground meets buildings flush: a building's floors start at the highest ground under it (full data height uphill) and a plinth in its color reaches the lowest (`buildingFooting`), so nothing floats or sinks; foam the same. Only 3D sets things on the terrain; trees sit on the surface and flat things are draped a few centimeters up (`scene/drape.ts`). Plan view prints natural contours and editing stays flat. The Terrain button turns it all off for a flat board (`store.showTerrain`, view state, not saved).
- e2e mocks our own `/api/geocode*`, `/api/context` and `/api/terrain`; parsers are tested against fixtures in `src/lib/server/fixtures/` captured live.

## Colors
Pull from the pattern book: green (adaptive reuse), orange (new construction), blue, red, off-white base. Define as CSS tokens and share with three.js materials.

## Workflow
- Start each milestone in plan mode and wait for approval.
- Small commits; run `npm run check`, `npm test`, and Playwright before declaring done.
- For visual changes, save screenshots to `tests/screenshots/` and summarize what changed.
- Update this file when a convention changes.
