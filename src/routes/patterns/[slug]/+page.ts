import { error } from '@sveltejs/kit';
import { getPattern } from '#lib/patterns/catalog';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const pattern = await getPattern(params.slug);
	if (!pattern) error(404, 'Pattern not found');
	return { pattern };
};
