import { error, redirect } from '@sveltejs/kit';
import { allowNewCommittees, listCommittees } from '#lib/server/committees';
import type { PageServerLoad } from './$types';

// The Faith & Home team's page: every committee, and who may start new ones
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	if (!locals.user.isTeam) error(404, 'Not found');
	return { committees: await listCommittees(locals.user), allowNew: await allowNewCommittees() };
};
