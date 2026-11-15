import { json } from '@sveltejs/kit';
import { removeMember, setRole } from '#lib/server/committees';
import { siteId as uuid } from '#lib/server/sites';
import type { RequestHandler } from './$types';

// Changes a member's role: { role }
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as { role?: unknown };
	await setRole(uuid(params.id), locals.user, uuid(params.userId), body.role);
	return json({ ok: true });
};

// Removes a member, or leaves (your own id)
export const DELETE: RequestHandler = async ({ params, locals }) => {
	await removeMember(uuid(params.id), locals.user, uuid(params.userId));
	return new Response(null, { status: 204 });
};
