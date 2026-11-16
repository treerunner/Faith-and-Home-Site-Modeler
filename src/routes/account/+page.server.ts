import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	return {};
};
