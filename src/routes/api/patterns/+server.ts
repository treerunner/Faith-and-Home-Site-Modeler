import { json } from '@sveltejs/kit';
import { listPatterns } from '#lib/server/patterns';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await listPatterns());
