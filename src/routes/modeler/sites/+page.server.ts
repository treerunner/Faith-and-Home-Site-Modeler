import { listSites } from '#lib/server/sites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ sites: await listSites() });
