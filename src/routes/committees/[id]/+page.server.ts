import { redirect } from '@sveltejs/kit';
import { getCommittee } from '#lib/server/committees';
import { siteId as uuid } from '#lib/server/sites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	return { committee: await getCommittee(uuid(params.id), locals.user) };
};
