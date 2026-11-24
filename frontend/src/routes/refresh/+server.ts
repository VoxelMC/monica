// "Refresh from Monica": forget orbit's cached Monica reads (normally kept up to
// 2 minutes) so the next page load shows changes made in Monica or on the phone.
// Sends nothing to Monica; not a proxy.
import { monica } from '#lib/server/monica/index.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	monica.invalidate();
	return new Response(null, { status: 204 });
};
