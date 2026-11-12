import { json } from '@sveltejs/kit';
import { listSites } from '#lib/server/sites';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await listSites());
