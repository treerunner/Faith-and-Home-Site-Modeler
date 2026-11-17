import { error, json } from '@sveltejs/kit';
import { inviteMember } from '#lib/server/committees';
import { siteId as uuid } from '#lib/server/sites';
import type { RequestHandler } from './$types';

// Invites someone by email: { email, role, note? } (a note goes in the email, not stored)
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	const body = (await request.json()) as { email?: unknown; role?: unknown; note?: unknown };
	if (typeof body.email !== 'string') error(400, 'email is required');
	await inviteMember(uuid(params.id), locals.user, body.email, body.role ?? 'member', url.origin, body.note ?? '');
	return json({ ok: true }, { status: 201 });
};
