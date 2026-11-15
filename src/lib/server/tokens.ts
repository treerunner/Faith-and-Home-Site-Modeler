// Random tokens for sign-in links, invitations and sessions. Only their SHA-256 hash is stored,
// so a database leak doesn't hand out working links.

// 32 random bytes, URL-safe (Web Crypto: no Node types or packages needed)
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const minutes = (n: number) => new Date(Date.now() + n * 60_000);
export const days = (n: number) => minutes(n * 24 * 60);

// Where a sign-in link may send you: a path on this site, never another site
export function safeNext(next: string | null | undefined, fallback = '/modeler/sites'): string {
	return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}

export function normalEmail(email: string): string | null {
	const e = email.trim().toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}
