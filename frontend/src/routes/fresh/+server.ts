// "Did the cached Monica data change?" Pages are built from orbit's cache straight
// away; reading an expired answer starts a background re-check. The browser asks
// here after each page load: this waits for running re-checks (up to 20 s) and
// says whether any of them brought back something new since `since`, in which
// case the browser reloads the page data (from the now fresh cache).
// Read-only; sends nothing to Monica itself.
import { json } from '@sveltejs/kit';
import { monica } from '#lib/server/monica/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const since = Number(url.searchParams.get('since'));
	const result = await monica.settle(Number.isFinite(since) && since > 0 ? since : Date.now());
	return json(result, { headers: { 'cache-control': 'no-store' } });
};
