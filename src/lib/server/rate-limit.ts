// A simple fixed-window counter: at most `max` hits per key in each window. In memory, so it
// counts per server process; enough to stop one machine from flooding inboxes.
export function limiter(max: number, windowMs: number) {
	const hits = new Map<string, { count: number; resetAt: number }>();
	return (key: string, now = Date.now()): boolean => {
		const h = hits.get(key);
		if (!h || now >= h.resetAt) {
			hits.set(key, { count: 1, resetAt: now + windowMs });
			if (hits.size > 10_000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
			return true;
		}
		h.count++;
		return h.count <= max;
	};
}
