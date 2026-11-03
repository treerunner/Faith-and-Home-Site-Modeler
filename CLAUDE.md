# CLAUDE.md: Faith & Home Site Modeler

## Project
Interactive site modeler for the Faith & Home pattern book (Small Cities Lab, Lehigh University). Users compose church properties from simple pieces and see a chipboard-style study model. Full plan: docs/PLAN.md.

## Stack
- SvelteKit (Svelte 5), TypeScript strict
- Threlte + three.js for the scene
- Neon Postgres with PostGIS
- Vitest for unit tests, Playwright for UI and screenshot tests

## Rules
- Site geometry is in meters in local coordinates; convert to lat/lng only at the edges (geocoding, saving origin).
- The `Site` object in `src/lib/modeler/types.ts` is the single source of truth. Rendering and metrics are derived from it; never store derived values.
- Metrics and building-type inference are pure functions in `src/lib/modeler/metrics.ts` with tests.
- One three.js scene with two cameras (orthographic plan, perspective orbit). Do not build a separate 2D editor.
- No Google Maps or Google 3D Tiles. No raster map tiles inside the 3D model.
- Do not add dependencies without asking.
- Aesthetic is a physical study model (chipboard, basswood, white foam). Never aim for photorealism.
- Use pattern-book vocabulary in UI copy: box, box-plus, cluster, object; urban, suburban, rural; adaptive reuse, new construction.
- UI copy: concise, no em dashes.

## Colors
Pull from the pattern book: green (adaptive reuse), orange (new construction), blue, red, off-white base. Define as CSS tokens and share with three.js materials.

## Workflow
- Start each milestone in plan mode and wait for approval.
- Small commits; run `npm run check`, `npm test`, and Playwright before declaring done.
- For visual changes, save screenshots to `tests/screenshots/` and summarize what changed.
- Update this file when a convention changes.
