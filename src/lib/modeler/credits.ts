import type { SiteContext, Terrain, TerrainRegion } from './types';

// Data credits for a site, from what it actually uses. Required by the sources' licenses
// (see docs/DATA_SOURCES.md and https://docs.overturemaps.org/attribution/).

export interface CreditGroup {
	heading: string; // what the data is: Buildings, Roads, Parcels, Elevation
	credits: string[]; // full credit lines, with license where known
}

// Overture's @geometry_source names, as credited. Unknown names are credited as given.
const BUILDING_CREDITS: Record<string, string> = {
	OpenStreetMap: '© OpenStreetMap contributors (ODbL)',
	'Esri Community Maps': 'Esri Community Maps (CC BY 4.0)',
	'Google Open Buildings': 'Google Open Buildings (CC BY 4.0)',
	'Microsoft ML Buildings': 'Microsoft Building Footprints',
};

// Short organization names for the one-line form
const BUILDING_ORGS: Record<string, string> = {
	OpenStreetMap: 'OpenStreetMap contributors',
	'Esri Community Maps': 'Esri Community Maps',
	'Google Open Buildings': 'Google Open Buildings',
	'Microsoft ML Buildings': 'Microsoft',
};

// The Terrain Tiles' required attribution (github.com/tilezen/joerd, docs/attribution.md):
// USGS and NOAA everywhere, plus a national source where one was used
const REGION_CREDITS: Record<TerrainRegion, string[]> = {
	world: [
		'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey',
		'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
	],
	au: ['Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017'],
	at: ['Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich'],
	ca: ['Canada terrain data contains information licensed under the Open Government Licence – Canada'],
	eu: ['Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers'],
	mx: ['Mexico terrain data source: INEGI, Continental relief, 2016'],
	nz: ['New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)'],
	no: ['Norway terrain data © Kartverket'],
	uk: ['United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved'],
};

const REGION_ORGS: Record<TerrainRegion, string> = {
	world: 'USGS, NOAA',
	au: 'Geoscience Australia',
	at: 'offene Daten Österreichs',
	ca: 'Open Government Licence – Canada',
	eu: 'Copernicus EU-DEM',
	mx: 'INEGI',
	nz: 'Land Information New Zealand',
	no: 'Kartverket',
	uk: 'Environment Agency',
};

function elevationCredits(terrain: Terrain): string[] {
	// Fetched from USGS 3DEP directly, before the Terrain Tiles
	if (!terrain.regions) return ['USGS 3D Elevation Program (public domain)'];
	return [...terrain.regions.flatMap((r) => REGION_CREDITS[r]), 'via the Terrain Tiles on AWS Open Data'];
}

export function creditGroups(context: SiteContext): CreditGroup[] {
	const sources = context.sources ?? [];
	const groups: CreditGroup[] = [];
	if (sources.includes('overture')) {
		const known = context.buildingSources;
		groups.push({
			heading: 'Buildings',
			credits: known?.length
				? [...known.map((s) => BUILDING_CREDITS[s] ?? s), 'via Overture Maps Foundation']
				: // Saved before sources were recorded: credit Overture's building sources in general
					['© OpenStreetMap contributors (ODbL) and other sources via Overture Maps Foundation'],
		});
		groups.push({
			heading: 'Roads',
			credits: ['© OpenStreetMap contributors (ODbL)', 'Data from TomTom', 'via Overture Maps Foundation'],
		});
	}
	if (sources.includes('pasda-lehigh')) {
		groups.push({ heading: 'Parcels', credits: ['Lehigh County, via PASDA (Pennsylvania Spatial Data Access)'] });
	}
	if (context.terrain) groups.push({ heading: 'Elevation', credits: elevationCredits(context.terrain) });
	return groups;
}

// One line for print: "Data: OpenStreetMap contributors, Overture Maps Foundation, TomTom, …"
export function creditLine(context: SiteContext): string | null {
	const sources = context.sources ?? [];
	const orgs: string[] = [];
	if (sources.includes('overture')) {
		const buildingOrgs = context.buildingSources?.length
			? context.buildingSources.map((s) => BUILDING_ORGS[s] ?? s)
			: ['OpenStreetMap contributors'];
		orgs.push(...buildingOrgs, 'OpenStreetMap contributors', 'Overture Maps Foundation', 'TomTom');
	}
	if (sources.includes('pasda-lehigh')) orgs.push('Lehigh County via PASDA');
	if (context.terrain) orgs.push(...(context.terrain.regions?.map((r) => REGION_ORGS[r]) ?? ['USGS']));
	const unique = [...new Set(orgs)];
	return unique.length ? `Data: ${unique.join(', ')}` : null;
}
