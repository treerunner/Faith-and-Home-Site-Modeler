import { error, redirect } from '@sveltejs/kit';
import { allowNewCommittees } from '#lib/server/committees';
import type { PageServerLoad } from './$types';

// The Faith & Home team's tools: who may start committees, and committees for others
// (the list of every committee is /committees)
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	if (!locals.user.isTeam) error(404, 'Not found');
	return { allowNew: await allowNewCommittees() };
};
