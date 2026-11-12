// Identifies us to the open-data services we call, as their usage policies ask.
export const USER_AGENT = 'FaithHomeSiteModeler/0.1 (Small Cities Lab, Lehigh University; kel723@lehigh.edu)';

// fetch with a timeout and our User-Agent; throws on non-2xx.
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers },
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!res.ok) throw new Error(`${url.split('?')[0]} returned ${res.status}`);
	return (await res.json()) as T;
}
