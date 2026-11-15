import { cancelInvitation } from '#lib/server/committees';
import { siteId as uuid } from '#lib/server/sites';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await cancelInvitation(uuid(params.id), locals.user, uuid(params.invitationId));
	return new Response(null, { status: 204 });
};
