import { error, json } from '@sveltejs/kit';
import { setPatternExample } from '#lib/server/patterns';
import { siteId } from '#lib/server/sites';
import type { RequestHandler } from './$types';

// Pegs a saved site's plan as the pattern's example: { siteId, planId } (planId null for its
// existing conditions). The Faith & Home team does this from the analysis, or in the CMS.
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.isTeam) error(403, 'Only the Faith & Home team sets pattern examples');
	const body = (await request.json()) as { siteId?: unknown; planId?: unknown };
	if (typeof body.siteId !== 'string') error(400, 'siteId is required');
	const planId = typeof body.planId === 'string' ? siteId(body.planId) : null; // same uuid check
	if (!(await setPatternExample(params.slug, siteId(body.siteId), planId))) error(404, 'Pattern not found');
	return json({ ok: true });
};
