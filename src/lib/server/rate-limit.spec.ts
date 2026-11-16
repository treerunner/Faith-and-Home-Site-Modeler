import { describe, it, expect } from 'vitest';
import { limiter } from './rate-limit';

describe('limiter', () => {
	it('allows max hits per key in a window, then resets', () => {
		const hit = limiter(2, 1000);
		expect([hit('a', 0), hit('a', 10), hit('a', 20), hit('b', 20)]).toEqual([true, true, false, true]);
		expect(hit('a', 1001)).toBe(true);
	});
});
