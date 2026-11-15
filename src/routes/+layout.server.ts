import type { LayoutServerLoad } from './$types';

// Who's signed in, for every page (the account menu, what the editor allows)
export const load: LayoutServerLoad = ({ locals }) => ({ user: locals.user });
