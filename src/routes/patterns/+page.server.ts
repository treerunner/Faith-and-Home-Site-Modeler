import { listPatterns } from '#lib/server/patterns';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ patterns: await listPatterns() });
