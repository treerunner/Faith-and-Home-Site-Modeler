import type { Cells, Pattern, PatternExample, SocialConditions, Variant } from '../patterns/catalog';

// Pattern rows as the database (and the CMS) hold them, and the Pattern the app uses. Pure, so
// the mapping is tested without a database.

export interface PatternRow {
	slug: string;
	name: string;
	summary: string;
	placeholder: boolean;
	buildingTypes: string[];
	siteTypes: string[];
	developmentTypes: string[];
}

export interface SectionRow {
	heading: string;
	body: string;
}

export type VariantRow = {
	key: string;
	name: string;
	summary: string;
} & Record<(typeof WHEN_COLUMNS)[number][1], string[] | null>;

// Each social condition and its column
export const WHEN_COLUMNS = [
	['size', 'whenSize'],
	['tenure', 'whenTenure'],
	['ownership', 'whenOwnership'],
	['partnering', 'whenPartnering'],
	['capacity', 'whenCapacity'],
	['change', 'whenChange'],
	['role', 'whenRole'],
] as const;

export function patternFromRows(row: PatternRow, sections: SectionRow[], variants: VariantRow[], example?: PatternExample): Pattern {
	const cells = {
		buildingTypes: row.buildingTypes,
		siteTypes: row.siteTypes,
		developmentTypes: row.developmentTypes,
	} as Cells;
	const toVariant = (v: VariantRow): Variant => {
		const when: Record<string, string[]> = {};
		for (const [key, column] of WHEN_COLUMNS) if (v[column]?.length) when[key] = v[column]!;
		return { key: v.key, name: v.name, summary: v.summary, when: when as SocialConditions };
	};
	return {
		slug: row.slug,
		name: row.name,
		summary: row.summary,
		placeholder: row.placeholder,
		sections: sections.map((s) => ({ heading: s.heading, text: s.body })),
		cells,
		...(variants.length ? { variants: variants.map(toVariant) } : {}),
		...(example ? { example } : {}),
	};
}

export function rowsFromPattern(p: Pattern): { row: PatternRow; sections: SectionRow[]; variants: VariantRow[] } {
	return {
		row: {
			slug: p.slug,
			name: p.name,
			summary: p.summary,
			placeholder: p.placeholder,
			buildingTypes: p.cells.buildingTypes,
			siteTypes: p.cells.siteTypes,
			developmentTypes: p.cells.developmentTypes,
		},
		sections: p.sections.map((s) => ({ heading: s.heading, body: s.text })),
		variants: (p.variants ?? []).map((v) => {
			const when = v.when as Record<string, string[] | undefined>;
			return {
				key: v.key,
				name: v.name,
				summary: v.summary,
				...(Object.fromEntries(WHEN_COLUMNS.map(([key, column]) => [column, when[key] ?? null])) as Record<(typeof WHEN_COLUMNS)[number][1], string[] | null>),
			};
		}),
	};
}
