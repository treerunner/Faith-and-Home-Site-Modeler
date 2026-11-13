import { describe, it, expect } from 'vitest';
import { BUILDING_TYPES, DEVELOPMENT_TYPES, getPattern, getPatterns, SITE_TYPES, type SocialConditions } from './catalog';
import { covers } from './match';

// Whatever content the team puts in, it must stay well formed.
const ANSWERS: { [K in keyof SocialConditions]-?: readonly string[] } = {
	size: ['small', 'medium', 'large'],
	tenure: ['new', 'recent', 'established', 'historic'],
	ownership: ['owned', 'leased'],
	partnering: ['open', 'unsure', 'not_now'],
	capacity: ['volunteers', 'some_staff', 'staffed'],
	change: ['preserve', 'adapt', 'transform'],
	role: ['gathering', 'service', 'housing_partner'],
};

describe('pattern catalog', async () => {
	const patterns = await getPatterns();

	it('has patterns with unique, URL-safe slugs', () => {
		expect(patterns.length).toBeGreaterThan(0);
		expect(new Set(patterns.map((p) => p.slug)).size).toBe(patterns.length);
		for (const p of patterns) expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		expect(patterns.map((p) => p.slug)).not.toContain('matrix'); // the coverage route
	});

	it('covers only known, non-empty cells', () => {
		for (const p of patterns) {
			const { buildingTypes, siteTypes, developmentTypes } = p.cells;
			for (const [values, allowed] of [[buildingTypes, BUILDING_TYPES], [siteTypes, SITE_TYPES], [developmentTypes, DEVELOPMENT_TYPES]] as [string[], readonly string[]][]) {
				expect(values.length, p.slug).toBeGreaterThan(0);
				for (const v of values) expect(allowed, p.slug).toContain(v);
			}
		}
	});

	it('gives each cell at most one pattern', () => {
		for (const buildingType of BUILDING_TYPES)
			for (const siteType of SITE_TYPES)
				for (const developmentType of DEVELOPMENT_TYPES) {
					const cell = { buildingType, siteType, developmentType };
					const owners = patterns.filter((p) => covers(p, cell)).map((p) => p.slug);
					expect(owners.length, `${siteType}/${buildingType}/${developmentType}: ${owners.join(', ')}`).toBeLessThanOrEqual(1);
				}
	});

	it('gives variants unique keys and known, non-empty conditions', () => {
		for (const p of patterns) {
			const variants = p.variants ?? [];
			expect(new Set(variants.map((v) => v.key)).size, p.slug).toBe(variants.length);
			for (const v of variants) {
				expect(v.name && v.summary, `${p.slug}/${v.key}`).toBeTruthy();
				const entries = Object.entries(v.when) as [keyof SocialConditions, string[]][];
				expect(entries.length, `${p.slug}/${v.key} has no conditions`).toBeGreaterThan(0);
				for (const [key, allowed] of entries) {
					expect(ANSWERS[key], `${p.slug}/${v.key}: unknown question ${key}`).toBeDefined();
					expect(allowed.length).toBeGreaterThan(0);
					for (const a of allowed) expect(ANSWERS[key], `${p.slug}/${v.key}.${key}`).toContain(a);
				}
			}
		}
	});

	it('gives every pattern a name, summary and sections', () => {
		for (const p of patterns) {
			expect(p.name && p.summary).toBeTruthy();
			expect(p.sections.length).toBeGreaterThan(0);
		}
	});

	it('finds a pattern by slug', async () => {
		expect((await getPattern(patterns[0].slug))?.name).toBe(patterns[0].name);
		expect(await getPattern('no-such-pattern')).toBeUndefined();
	});
});
