import { toLatLng, type LatLng } from '../modeler/geo';
import type { Terrain } from '../modeler/types';
import { fetchBytes } from './http';
import { parseGeoTiff, type GeoRaster } from './tiff';

// Ground elevation from USGS 3DEP (public domain, US only). exportImage sends the whole board
// as one small float32 GeoTIFF in a few seconds; getSamples took over 20 s for 500 points.

const EXPORT_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
export const TERRAIN_SPACING = 5; // meters between grid points
const PIXEL = 2.5; // requested pixel size in meters: finer than the grid, so resampling stays smooth
const NO_DATA_BELOW = -1000;

// The raster request around the board, with a margin so the edge points resample inside it
export function terrainUrl(origin: LatLng, half: number): string {
	const edge = half + TERRAIN_SPACING;
	const nw = toLatLng(-edge, -edge, origin);
	const se = toLatLng(edge, edge, origin);
	// Pixels square in degrees, as the service keeps them: wider than tall away from the equator
	const rows = Math.ceil((2 * edge) / PIXEL);
	const cols = Math.ceil((rows * (se.lng - nw.lng)) / (nw.lat - se.lat));
	const params = new URLSearchParams({
		bbox: `${nw.lng},${se.lat},${se.lng},${nw.lat}`,
		bboxSR: '4326',
		imageSR: '4326',
		size: `${cols},${rows}`,
		format: 'tiff',
		pixelType: 'F32',
		compression: 'None',
		interpolation: 'RSP_BilinearInterpolation',
		f: 'image',
	});
	return `${EXPORT_URL}?${params}`;
}

// Resamples the raster onto the board's grid: points from -half to +half every TERRAIN_SPACING m,
// row by row from north to south, rounded to 0.1 m. Null if any point has no data.
export function terrainFromRaster(raster: GeoRaster, origin: LatLng, half: number): Terrain | null {
	const n = Math.round((2 * half) / TERRAIN_SPACING) + 1;
	const { width, height, values } = raster;
	const at = (c: number, r: number) =>
		values[Math.min(height - 1, Math.max(0, r)) * width + Math.min(width - 1, Math.max(0, c))];
	const heights: number[] = [];
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const { lat, lng } = toLatLng(-half + j * TERRAIN_SPACING, -half + i * TERRAIN_SPACING, origin);
			// Pixel coordinates, with pixel centers at whole numbers
			const px = (lng - raster.west) / raster.scaleX - 0.5;
			const py = (raster.north - lat) / raster.scaleY - 0.5;
			const c = Math.floor(px), r = Math.floor(py);
			const fx = px - c, fy = py - r;
			const z =
				at(c, r) * (1 - fx) * (1 - fy) + at(c + 1, r) * fx * (1 - fy) + at(c, r + 1) * (1 - fx) * fy + at(c + 1, r + 1) * fx * fy;
			if (!Number.isFinite(z) || z < NO_DATA_BELOW) return null;
			heights.push(Math.round(z * 10) / 10);
		}
	}
	return { spacing: TERRAIN_SPACING, heights };
}

// Null where 3DEP has no data; throws if the service fails. Outside the US it hangs, then times out.
export async function fetchTerrain(origin: LatLng, half: number): Promise<Terrain | null> {
	const buf = await fetchBytes(terrainUrl(origin, half));
	return terrainFromRaster(parseGeoTiff(buf), origin, half);
}
