import { describe, it, expect } from 'vitest';
import { newShortId, parseShortId, siteSlug, slugify } from './slug';

describe('slugify', () => {
	it.each([
		['Grace Church', 'grace-church'],
		["St. Mary's Parish", 'st-marys-parish'],
		['Iglesia de San José', 'iglesia-de-san-jose'],
		['  First  Baptist / Annex!  ', 'first-baptist-annex'],
		['Scenario 2: housing', 'scenario-2-housing'],
		['', 'untitled'],
		['!!!', 'untitled'],
	])('%j -> %j', (name, slug) => {
		expect(slugify(name)).toBe(slug);
	});

	it('trims long names at a word boundary', () => {
		const slug = slugify('The Congregation of the Holy Redeemer Fellowship Hall and Sunday School Wing');
		expect(slug.length).toBeLessThanOrEqual(50);
		expect(slug).toBe('the-congregation-of-the-holy-redeemer-fellowship');
	});
});

describe('newShortId', () => {
	it('makes 6 readable characters', () => {
		for (let i = 0; i < 200; i++) expect(newShortId()).toMatch(/^[2-9a-hjkmnp-z]{6}$/);
	});

	it('does not repeat in practice', () => {
		const ids = new Set(Array.from({ length: 1000 }, newShortId));
		expect(ids.size).toBe(1000);
	});
});

describe('parseShortId', () => {
	it('reads the id after the last dash', () => {
		expect(parseShortId('grace-church-7f3k9q')).toBe('7f3k9q');
		expect(parseShortId(siteSlug('Scenario 2: housing', 'abc234'))).toBe('abc234');
	});

	it('accepts a bare id and ignores case', () => {
		expect(parseShortId('7F3K9Q')).toBe('7f3k9q');
	});

	// A title-only slug like "grace-church" parses as id "church"; the lookup then 404s.
	it('rejects tails that cannot be ids', () => {
		expect(parseShortId('grace-ch')).toBeNull();
		expect(parseShortId('grace-church-')).toBeNull();
		expect(parseShortId('grace-church-ab$12x')).toBeNull();
	});
});
