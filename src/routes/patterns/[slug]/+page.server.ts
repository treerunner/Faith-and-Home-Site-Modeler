import { error } from '@sveltejs/kit';
import { getPatternBySlug } from '#lib/server/patterns';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const pattern = await getPatternBySlug(params.slug);
	if (!pattern) error(404, 'Pattern not found');
	return { pattern };
};
