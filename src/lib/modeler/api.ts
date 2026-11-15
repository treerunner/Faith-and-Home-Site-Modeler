// Identifies a saved site; returned by save and duplicate.
export interface SiteRef {
	id: string;
	slug: string;
	name: string;
	version: number; // the saved version; the next save is made from it
}

// Browser-side calls to /api/sites. The server validates with normalizeSite.

// A failed API call, with its status and the server's message
export class ApiError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
	}
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	if (!res.ok) {
		const message = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
		throw new ApiError(res.status, message ?? `${init?.method ?? 'GET'} ${url} failed: ${res.status}`);
	}
	return (res.status === 204 ? undefined : await res.json()) as T;
}

export function putSite(json: string, id: string): Promise<SiteRef> {
	return request(`/api/sites/${id}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: json,
	});
}

export function duplicateSite(id: string): Promise<SiteRef> {
	return request(`/api/sites/${id}/duplicate`, { method: 'POST' });
}

export function deleteSite(id: string): Promise<void> {
	return request(`/api/sites/${id}`, { method: 'DELETE' });
}

// /modeler/<site> is the site view (existing conditions); a plan adds its slug. Existing
// conditions have no slug, so planUrl with an empty slug is the site view.
export const siteUrl = (siteSlug: string) => `/modeler/${siteSlug}`;
export const planUrl = (siteSlug: string, planSlug: string, view = false) =>
	`/modeler/${siteSlug}${planSlug ? `/${planSlug}` : ''}${view ? '/view' : ''}`;
