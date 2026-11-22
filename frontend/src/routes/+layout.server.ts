import type { LayoutServerLoad } from './$types';

// Re-run (cheaply: it only reads the cookie) whenever a setting changes, so pages
// built later in the same visit show the current choice, not the one from first load.
export const load: LayoutServerLoad = ({ locals, depends }) => {
	depends('orbit:prefs');
	return { prefs: locals.prefs };
};
