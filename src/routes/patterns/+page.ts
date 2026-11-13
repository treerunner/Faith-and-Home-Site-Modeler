import { getPatterns } from '#lib/patterns/catalog';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => ({ patterns: await getPatterns() });
