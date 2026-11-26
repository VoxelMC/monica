import { getDb } from '#lib/server/monica/index.js';
import { getTagHues } from '#lib/server/tag-colours.js';
import type { LayoutServerLoad } from './$types';

// Re-run (cheaply: it only reads the cookie) whenever a setting changes, so pages
// built later in the same visit show the current choice, not the one from first load.
export const load: LayoutServerLoad = ({ locals, depends }) => {
	depends('orbit:prefs');
	// serverNow: where this browser starts asking /fresh whether cached data changed.
	// tagHues: the tag colours chosen on the Tags page (orbit's DB; a quick local read).
	return { prefs: locals.prefs, serverNow: Date.now(), tagHues: getTagHues(getDb()) };
};
