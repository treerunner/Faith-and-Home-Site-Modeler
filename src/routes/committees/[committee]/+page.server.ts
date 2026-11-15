import { error, redirect } from '@sveltejs/kit';
import { findCommittee, getCommittee } from '#lib/server/committees';
import type { PageServerLoad } from './$types';

// /committees/<slug>; an earlier slug or the committee's id redirects to the current slug
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	const found = await findCommittee(params.committee);
	if (!found) error(404, 'Committee not found');
	if (params.committee !== found.slug) redirect(308, `/committees/${found.slug}`);
	return { committee: await getCommittee(found.id, locals.user) };
};
