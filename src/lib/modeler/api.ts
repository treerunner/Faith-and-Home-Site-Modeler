import { siteSlug } from './slug';

// Identifies a saved site; returned by save and duplicate.
export interface SiteRef {
	id: string;
	shortId: string;
	name: string;
}

// Browser-side calls to /api/sites. The server validates with normalizeSite.

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${res.status}`);
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

export const editUrl = (name: string, shortId: string) => `/modeler/${siteSlug(name, shortId)}`;
export const viewUrl = (name: string, shortId: string) => `${editUrl(name, shortId)}/view`;
