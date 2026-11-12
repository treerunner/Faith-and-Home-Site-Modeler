import { getSite, siteId } from '#lib/server/sites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({ site: await getSite(siteId(params.id)) });
