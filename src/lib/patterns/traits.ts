import type { Pattern, TraitKey } from './catalog';
import { traitLabel } from './match';

// A pattern's traits as readable chips, spatial ones first: "Box-Plus", "urban site", ...
const ORDER: TraitKey[] = ['buildingTypes', 'siteTypes', 'interventions', 'housing', 'size', 'tenure', 'ownership', 'partnering', 'capacity', 'change', 'role'];

export function traitChips(pattern: Pattern): string[] {
	return ORDER.flatMap((key) => (pattern.traits[key] ?? []).map((v) => traitLabel(key, v)));
}
