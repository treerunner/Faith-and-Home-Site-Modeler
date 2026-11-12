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
- The `Site` object in `src/lib/modeler/types.ts` is the single source of truth. Rendering and metrics are derived from it; never store derived values.
- Metrics and building-type inference are pure functions in `src/lib/modeler/metrics.ts` with tests.
- One three.js scene with two cameras (orthographic plan, perspective orbit). Do not build a separate 2D editor.
- No Google Maps or Google 3D Tiles. No raster map tiles inside the 3D model.
- Do not add dependencies without asking.
- Aesthetic is a physical study model (chipboard, basswood, white foam). Never aim for photorealism.
- Import app code with `#lib/...`. Env vars are declared in `src/env.ts` and read from `$app/env/private` (SvelteKit 3; not `$env/...`).
- Use pattern-book vocabulary in UI copy: box, box-plus, cluster, object; urban, suburban, rural; adaptive reuse, new construction.
- UI copy: concise, no em dashes.

## Persistence
- One `sites` table (`src/lib/server/db/schema.ts`): the full `Site` as JSON in `data`, plus `name` for listing. Server helpers in `src/lib/server/sites.ts`.
- Every read and write passes through `normalizeSite` (`src/lib/modeler/serialize.ts`). When adding a field to `Site`, update it there with a default so older saves still load.
- Schema changes: edit `schema.ts`, then `npm run db:generate` and `npm run db:migrate` (reads `DATABASE_URL` from `.env`).
- No auth yet: anyone with `/modeler/[id]` can edit; `/modeler/[id]/view` is the read-only share link. `store.readOnly` gates editing.
- Playwright tests write to the `.env` database and delete the rows they create.

## Colors
Pull from the pattern book: green (adaptive reuse), orange (new construction), blue, red, off-white base. Define as CSS tokens and share with three.js materials.

## Workflow
- Start each milestone in plan mode and wait for approval.
- Small commits; run `npm run check`, `npm test`, and Playwright before declaring done.
- For visual changes, save screenshots to `tests/screenshots/` and summarize what changed.
- Update this file when a convention changes.
