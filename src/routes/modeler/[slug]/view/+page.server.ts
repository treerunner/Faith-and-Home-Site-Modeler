import { loadSiteRoute } from '#lib/server/sites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadSiteRoute(params.slug, true);
