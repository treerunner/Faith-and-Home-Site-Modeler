import { error, json } from '@sveltejs/kit';
import { createCommitteeFor } from '#lib/server/committees';
import type { RequestHandler } from './$types';

// The team creates a committee and invites its first lead: { name, leadEmail }
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const body = (await request.json()) as { name?: unknown; leadEmail?: unknown };
	if (typeof body.name !== 'string' || typeof body.leadEmail !== 'string') error(400, 'name and leadEmail are required');
	return json({ id: await createCommitteeFor(locals.user, body.name, body.leadEmail, url.origin) }, { status: 201 });
};
