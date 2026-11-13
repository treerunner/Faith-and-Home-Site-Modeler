import { describe, it, expect } from 'vitest';
import { getPattern, getPatterns, WEIGHTS, type TraitKey } from './catalog';

// Whatever content the team puts in, it must stay well formed.
const ALLOWED: Record<TraitKey, readonly string[]> = {
	buildingTypes: ['box', 'box_plus', 'object', 'cluster'],
	siteTypes: ['urban', 'suburban', 'rural'],
	interventions: ['reuse', 'new', 'both', 'none'],
	housing: ['none', 'some', 'significant'],
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
	});

	it('uses only known trait values', () => {
		for (const p of patterns) {
			for (const [key, values] of Object.entries(p.traits) as [TraitKey, string[]][]) {
				expect(ALLOWED[key], `${p.slug}: unknown trait ${key}`).toBeDefined();
				for (const v of values) expect(ALLOWED[key], `${p.slug}.${key}`).toContain(v);
				expect(values.length, `${p.slug}.${key} is empty`).toBeGreaterThan(0);
			}
		}
	});

	it('gives every pattern a name, summary and sections', () => {
		for (const p of patterns) {
			expect(p.name && p.summary).toBeTruthy();
			expect(p.sections.length).toBeGreaterThan(0);
		}
	});

	it('weighs every trait', () => {
		for (const key of Object.keys(ALLOWED) as TraitKey[]) expect(WEIGHTS[key]).toBeGreaterThan(0);
	});

	it('finds a pattern by slug', async () => {
		expect((await getPattern(patterns[0].slug))?.name).toBe(patterns[0].name);
		expect(await getPattern('no-such-pattern')).toBeUndefined();
	});
});
