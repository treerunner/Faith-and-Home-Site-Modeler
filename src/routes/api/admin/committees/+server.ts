import { error, json } from '@sveltejs/kit';
import { createCommitteeFor } from '#lib/server/committees';
import type { RequestHandler } from './$types';

// The team creates a committee and invites its first lead: { name, leadEmail, description? }
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const body = (await request.json()) as { name?: unknown; leadEmail?: unknown; description?: unknown };
	if (typeof body.name !== 'string' || typeof body.leadEmail !== 'string') error(400, 'name and leadEmail are required');
	return json({ id: await createCommitteeFor(locals.user, body.name, body.leadEmail, url.origin, body.description) }, { status: 201 });
};
