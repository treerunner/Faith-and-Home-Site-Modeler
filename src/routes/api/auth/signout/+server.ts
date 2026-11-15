import { json } from '@sveltejs/kit';
import { endSession } from '#lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	await endSession(cookies);
	return json({ ok: true });
};
