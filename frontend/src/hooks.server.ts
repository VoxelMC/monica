import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { htmlAttrs, parsePrefs, PREFS_COOKIE } from '#lib/prefs.js';

// Fail fast: load the Monica settings when the server starts, so a missing
// MONICA_URL or MONICA_TOKEN stops the container with a clear error instead of
// failing on the first page view.
export const init: ServerInit = async () => {
	await import('#lib/server/monica/index.js');
};

// Display preferences (theme, font) from the cookie, applied to <html> before
// the page is sent, so the right theme paints first.
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.prefs = parsePrefs(event.cookies.get(PREFS_COOKIE));
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%orbit.attrs%', htmlAttrs(event.locals.prefs))
	});
};
