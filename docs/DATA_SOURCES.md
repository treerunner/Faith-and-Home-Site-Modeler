# Data sources

Every outside data source the modeler uses or has considered: what it provides, where it's called from, its terms, and its caveats. Keep this current when a source is added, dropped or updated, and update the credits in `src/lib/modeler/credits.ts` to match. Last reviewed 2026-11-13.

Outbound requests identify themselves with the User-Agent in `src/lib/server/http.ts` (`FaithHomeSiteModeler/0.1 (Small Cities Lab, Lehigh University; …)`), as the services' usage policies ask.

## In use

### Overture Maps: buildings and roads
| | |
|---|---|
| Provides | Neighboring buildings (foam blocks; their footprints become structures when added from a parcel) and roads (printed on the board) |
| Source | Overture PMTiles archives on AWS S3: `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/<release>/buildings.pmtiles` and `…/transportation.pmtiles` |
| Release | `2026-10-21.0` (`OVERTURE_RELEASE` in `src/lib/server/overture.ts`) |
| Access | HTTP range requests through the `pmtiles` library, zoom 14 tiles (about 0.45 m precision), decoded with `@mapbox/vector-tile`. About 2 s cold, under 0.5 s warm. No key, no import, global coverage |
| Fields used | Buildings: outline, `height`, `num_floors`, `class` (church, house…), `@name`, `id`. Roads: `class` (streets only: motorway through service; footways, rail and water skipped), `subtype` |
| Called from | `src/lib/server/overture.ts`, via `/api/context` (`src/lib/server/context.ts`) |
| License | ODbL for both themes. Some buildings come from other sources under their own terms, such as Esri Community Maps (CC BY 4.0) |
| Attribution required | Buildings: "© OpenStreetMap contributors. Available under the Open Database License." plus credit for other contributing sources. Transportation: the same, plus "Data from TomTom." See https://docs.overturemaps.org/attribution/ |
| Coverage notes | In an Allentown test tile, 68% of buildings had a floor count and 10% a measured height; the rest get default heights, marked "Confirm the stories." Tiles cut buildings at their edges; pieces are merged by Overture `id` |
| Upkeep | Overture publishes new releases regularly and removes old ones. Bump `OVERTURE_RELEASE` every few months, then rerun the parser tests (`src/lib/server/parsers.spec.ts`) |

### PASDA: Lehigh County parcels
| | |
|---|---|
| Provides | Parcel outlines to choose (and merge) as the property |
| Source | Pennsylvania Spatial Data Access (Penn State), ArcGIS MapServer layer: `https://mapservices.pasda.psu.edu/server/rest/services/pasda/LehighCounty/MapServer/5` |
| Snapshot | August 2021 (`Lehigh County Parcels 202108`). Lots may have merged or split since |
| Access | ArcGIS REST `query`, `f=geojson`, envelope within 100 m of the address. No key |
| Fields used | Outline, `PIN`, situs address (`SITUS_ADDR`, `SITUS_FDPR`, `SITUS_FNAM`, `SITUS_FTYP`, `SITUS_FDSU`). There is **no owner field** |
| Called from | `src/lib/server/parcels.ts` (a per-county registry), via `/api/context` |
| Attribution shown | "Parcels: Lehigh County via PASDA" |
| Coverage notes | Lehigh County only. Neighboring parcels share edges exactly, so touching lots merge cleanly. Everywhere else the parcel is drawn by hand |

### Photon: address suggestions
| | |
|---|---|
| Provides | Suggestions as you type in the Address box |
| Source | `https://photon.komoot.io/api/` (komoot's public instance, built on OpenStreetMap) |
| Access | `q`, `limit=6`, `lang=en`, biased toward the Lehigh Valley (`lat=40.62`, `lon=-75.42`) without excluding anywhere else. Debounced 300 ms in the browser, proxied by `/api/geocode/suggest` |
| Called from | `src/lib/server/geocode.ts` |
| Terms | Free, no key, typeahead allowed; fair use ("extensive usage will be throttled"); no availability guarantee. OSM data is ODbL |
| Notes | Places churches as points on the building itself, which is why its point is used when a suggestion is a place or has a house number |

### US Census Geocoder: address points
| | |
|---|---|
| Provides | A precise point for free-text addresses, and for suggestions that are street-level only |
| Source | `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress`, `benchmark=Public_AR_Current` |
| Called from | `src/lib/server/geocode.ts`, via `/api/geocode` |
| Terms | Public domain; storing results is fine. No key. No service-level agreement |
| Notes | US only. Interpolates along the street centerline, so points can land in the road |

### AWS Terrain Tiles: elevation
| | |
|---|---|
| Provides | Ground elevation for the terrain surface, contours and building plinths |
| Source | Mapzen's Terrain Tiles on AWS Open Data: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` ("Terrarium" PNGs: height = R × 256 + G + B / 256 − 32768) |
| Snapshot | November 2017; not updated |
| Access | Zoom 15 (about 3.6 m pixels at 40°N), 1 to 4 tiles per board, fetched in parallel; 0.1 to 0.5 s per board in testing. Decoded by our own minimal PNG reader (`src/lib/server/png.ts`), resampled to a 5 m grid saved with the site. Heights below sea level clamp to it (offshore the tiles carry the sea floor). No key |
| Called from | `src/lib/server/elevation.ts`, via `/api/terrain` (separate from `/api/context`, so setup never waits on it) |
| Built from | US: USGS 3DEP (10 m, 3 m in places). Elsewhere: national sources (Australia, Austria, Canada, EU-DEM, Mexico, New Zealand, Norway, United Kingdom) and global ones (SRTM, GMTED2010, ETOPO1) |
| Attribution required | Per github.com/tilezen/joerd, docs/attribution.md: "United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey", "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration", plus each national source used. We record the regions a board falls in (`terrain.regions`, rough generous boxes) and credit those |
| Coverage notes | Global. Matched USGS 3DEP within 6 cm on average (40 cm at most) on the fixture board in Allentown |

### Railway Postgres with PostGIS (our own storage)
Not outside data, but where everything above ends up. Each site's neighborhood, roads, parcel, terrain and origin are fetched once at setup and saved with the site in `sites.data`. The origin and parcel are also written as PostGIS geography (`sites.origin`, `sites.parcel`) for spatial queries. Nothing is re-fetched when a site loads.

## Assets
Not data, but outside files shipped with the app.

### ambientCG Paper006: paper grain texture
| | |
|---|---|
| Provides | The faint paper grain on buildings and the board in 3D (`static/textures/paper-grain.jpg`, used by `src/lib/modeler/scene/grain.ts`) |
| Source | ambientcg.com/view?id=Paper006, 1K JPG color map, downloaded 2026-11-13 |
| Terms | CC0 1.0 (public domain). No attribution required, so nothing in credits.ts |
| Changes | Made gray and halved to 512 px with macOS `sips`, color profile removed, about 65 KB. Its average brightness and spread are constants in `grain.ts`; remeasure them if the image is replaced |
| Considered | Architextures (its terms forbid publishing its images in a web app); ambientCG Paper002, Cardboard002 and Chipboard005 (tried, not chosen) |

## Considered, not used

| Source | Why not |
|---|---|
| USGS 3DEP ImageServer (`exportImage`, used Nov 2026 before the Terrain Tiles) | 1 m lidar, but slow and flaky on areas it hadn't read recently: up to 25 s, or a 502/504; `getSamples` was slower still (over 20 s for 500 points). US only. Sites saved with it keep their terrain and its credit |
| OpenStreetMap Overpass API | All three public servers failed repeatedly in Nov 2026 tests (at capacity, gateway timeouts, 90 s hangs). Too unreliable for live setup |
| Regional import (Overture or OSM extract into PostGIS) | Would have to be repeated for every new region; the tool should scale beyond the Lehigh Valley |
| Lehigh County's own GIS server | Behind bot protection (Incapsula); not usable from an app |
| Northampton County parcels | No reachable source: not on PASDA, and the county's parcel viewer service timed out |
| PASDA Lehigh building footprints and road centerlines | 2021 data without heights; Overture is more current and has heights |
| Nominatim (OSM geocoder) | Its public usage policy forbids autocomplete |
| Regrid (national parcels with owners) | Paid. Owners would help find all of a church's lots, but no free source has them |
| Google Maps / Photorealistic 3D Tiles | Excluded by project rule (terms and aesthetic) |
| MapLibre and map tiles | Address picking happens in the model instead; no raster tiles in the model |

## Credits
Built from what each site actually uses (`src/lib/modeler/credits.ts`). At setup, the distinct Overture building sources (`@geometry_source`) are saved with the site, so only those are credited; roads always credit OpenStreetMap and TomTom; parcels are credited only when a county parcel was used; elevation only when the site has terrain, with national sources by region. Sites saved before 2026-11-13 get a general Overture building credit.

They appear in three places:
- **Map:** a small "i" button in the canvas corner (address mode) opens the full credits, grouped by Buildings, Roads, Parcels, Elevation.
- **Analysis:** one "Data: …" line at the end of the report, so it prints with it.
- **PNG export:** the same line printed in the image's bottom-right corner.

## Open items
- **More counties:** add parcel sources to the registry in `src/lib/server/parcels.ts` as the tool reaches new places.
- **Overture release:** currently `2026-10-21.0`; check for a newer one every few months.
- **Outside the US:** the Census geocoder is US-only. Terrain is global; check the national credit boxes in `elevation.ts` as the tool reaches new countries.
