import type { ServerInit } from '@sveltejs/kit/hooks';

// Fail fast: load the Monica settings when the server starts, so a missing
// MONICA_URL or MONICA_TOKEN stops the container with a clear error instead of
// failing on the first page view.
export const init: ServerInit = async () => {
	await import('#lib/server/monica/index.js');
};
