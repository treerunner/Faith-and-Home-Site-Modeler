// Internal geometry is always in meters. Convert to feet only at display time.

export const M_TO_FT   = 3.28084;
export const SQM_TO_SQFT = 10.7639;

export const ftToM  = (ft: number): number => ft / M_TO_FT;
export const mToFt  = (m:  number): number => m  * M_TO_FT;
export const sqmToSqft = (sqm: number): number => sqm * SQM_TO_SQFT;

/** Format a meter value as rounded feet with unit label. */
export function fmtFt(m: number, decimals = 0): string {
	return `${(m * M_TO_FT).toFixed(decimals)} ft`;
}

/** Format a square-meter area as rounded sq ft with unit label. */
export function fmtSqft(sqm: number): string {
	return `${Math.round(sqm * SQM_TO_SQFT).toLocaleString()} sq ft`;
}
