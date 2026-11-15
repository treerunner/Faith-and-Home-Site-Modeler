import { redirect } from '@sveltejs/kit';
import { allowNewCommittees, listCommittees } from '#lib/server/committees';
import type { PageServerLoad } from './$types';

// Your committees (the team sees every one), and whether you can start another
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	return {
		committees: await listCommittees(locals.user),
		canStart: locals.user.isTeam || (await allowNewCommittees()),
	};
};
