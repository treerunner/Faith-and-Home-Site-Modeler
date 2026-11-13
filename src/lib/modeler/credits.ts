import type { SiteContext } from './types';

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
	if (context.terrain) groups.push({ heading: 'Elevation', credits: ['USGS 3D Elevation Program (public domain)'] });
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
	if (context.terrain) orgs.push('USGS');
	const unique = [...new Set(orgs)];
	return unique.length ? `Data: ${unique.join(', ')}` : null;
}
