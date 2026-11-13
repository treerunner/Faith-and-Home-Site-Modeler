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

### USGS 3DEP: elevation
| | |
|---|---|
| Provides | Ground elevation for stacked chipboard terrain layers and plan contours |
| Source | `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage` |
| Access | One request per board: `format=tiff`, `pixelType=F32`, `compression=None`, bilinear, 5 m pixels in degrees (`bboxSR=imageSR=4326`). 70 to 260 KB. Response times vary a lot: under 2 s for an area read recently, up to about 25 s or a 504 for a cold one, so the fetch waits 30 s and retries once. Parsed by our own minimal GeoTIFF reader (`src/lib/server/tiff.ts`), resampled to a 5 m grid saved with the site. No key |
| Called from | `src/lib/server/elevation.ts`, via `/api/terrain` (separate from `/api/context`, so setup never waits on it) |
| Terms | Public domain (USGS) |
| Attribution shown | "USGS 3D Elevation Program" when a site has terrain |
| Coverage notes | US only, 1 m lidar where available. Outside the US the service hangs and returns 504 (London tested), so we only ask within rough boxes around the US and its territories; elsewhere the board stays flat. `getSamples` was tried first: over 20 s for 500 points, and 2,000 points timed out |

### Railway Postgres with PostGIS (our own storage)
Not outside data, but where everything above ends up. Each site's neighborhood, roads, parcel, terrain and origin are fetched once at setup and saved with the site in `sites.data`. The origin and parcel are also written as PostGIS geography (`sites.origin`, `sites.parcel`) for spatial queries. Nothing is re-fetched when a site loads.

## Considered, not used

| Source | Why not |
|---|---|
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
Built from what each site actually uses (`src/lib/modeler/credits.ts`). At setup, the distinct Overture building sources (`@geometry_source`) are saved with the site, so only those are credited; roads always credit OpenStreetMap and TomTom; parcels are credited only when a county parcel was used; elevation only when the site has terrain. Sites saved before 2026-11-13 get a general Overture building credit.

They appear in three places:
- **Map:** a small "i" button in the canvas corner (address mode) opens the full credits, grouped by Buildings, Roads, Parcels, Elevation.
- **Analysis:** one "Data: …" line at the end of the report, so it prints with it.
- **PNG export:** the same line printed in the image's bottom-right corner.

## Open items
- **More counties:** add parcel sources to the registry in `src/lib/server/parcels.ts` as the tool reaches new places.
- **Overture release:** currently `2026-10-21.0`; check for a newer one every few months.
- **Outside the US:** the Census geocoder and USGS 3DEP are US-only; other sources would be needed abroad.
