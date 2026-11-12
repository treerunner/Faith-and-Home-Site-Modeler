import { loadPlanRoute } from '#lib/server/sites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadPlanRoute(params.site, params.plan, false);
