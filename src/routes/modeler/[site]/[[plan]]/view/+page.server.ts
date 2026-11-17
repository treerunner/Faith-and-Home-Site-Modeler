import { loadPlanRoute } from '#lib/server/sites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, url }) => loadPlanRoute(params.site, params.plan, true, locals.user, url.pathname, url.search);
