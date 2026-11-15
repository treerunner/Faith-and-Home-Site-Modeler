import { allowNewCommittees } from '#lib/server/committees';
import type { LayoutServerLoad } from './$types';

// Who's signed in, for every page (the account menu, what the editor allows), and whether they
// may start a committee when they save
export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.user,
	allowNewCommittees: locals.user && !locals.user.isTeam ? await allowNewCommittees() : true,
});
