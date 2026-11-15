import { describe, it, expect } from 'vitest';
import { patternFromRows, rowsFromPattern } from './pattern-rows';
import { SEED_PATTERNS } from '../patterns/seed';

describe('pattern rows', () => {
	it('round trips every seed pattern through its rows', () => {
		for (const p of SEED_PATTERNS) {
			const { row, sections, variants } = rowsFromPattern(p);
			expect(patternFromRows(row, sections, variants)).toEqual(p);
		}
	});

	it('leaves empty conditions out of a variant', () => {
		const p = SEED_PATTERNS.find((x) => x.variants?.length)!;
		const { row, sections, variants } = rowsFromPattern(p);
		const v = { ...variants[0], whenSize: [] };
		expect(patternFromRows(row, sections, [v]).variants![0].when).toEqual(p.variants![0].when);
	});
});
